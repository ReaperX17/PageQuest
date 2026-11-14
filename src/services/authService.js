import { cloudStorage as AsyncStorage } from '../config/firebaseConfig';
import {
  createParentProfile,
  createChildProfile,
  isValidPhoneNumber,
  normalizePhoneNumber
} from '../models/schemas';

const PARENTS_STORAGE_KEY = '@registered_parents';
const CHILDREN_STORAGE_KEY = '@registered_children';
const PERSISTENT_CHILD_SESSION_KEY = '@persistent_child_session';
const PARENT_SETTINGS_PREFIX = '@parent_settings_';

/**
 * Deterministic salted multi-round password hash so parent passwords are never stored
 * in plain text in local storage or Cloud Firestore.
 */
export function hashParentPassword(username, rawPassword) {
  const pwd = String(rawPassword || '');
  if (pwd.startsWith('pqhash$v1$')) return pwd;
  const normalizedUser = String(username || '').trim().toLowerCase();
  const salt = `pagequest_salt_v1_${normalizedUser}`;
  const input = `${salt}:${pwd}:${salt}`;

  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `pqhash$v1$${hex1}${hex2}`;
}

export const DEFAULT_PARENT_SETTINGS = {
  notifyOnReadingStart: true,
  notifyOnPageUpdate: true,
  notifyOnQuizComplete: true,
  childRemindersEnabled: true,
  dailyReminderTime: '4:30 PM',
  defaultReminderMessage: 'Time for your daily reading! Pick up your book and log your pages.',
  dailyPageGoal: 15
};

// Generate a random 6-character alphanumeric code
export function generateChildInviteCode(existingCodes = []) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes confusing chars O, 0, I, 1
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (existingCodes.includes(code));
  return code;
}

export async function getAllParents() {
  try {
    const stored = await AsyncStorage.getItem(PARENTS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    let migrated = false;

    // Ensure every parent has a familyId, coParentInviteCode, and hashed password
    const existingCoCodes = parsed.map((p) => p.coParentInviteCode).filter(Boolean);
    const updated = parsed.map((p) => {
      const needsPasswordHash =
        p.password && !String(p.password).startsWith('pqhash$v1$');
      if (!p.familyId || !p.coParentInviteCode || needsPasswordHash) {
        migrated = true;
        const newCoCode = p.coParentInviteCode || generateChildInviteCode(existingCoCodes);
        existingCoCodes.push(newCoCode);
        return {
          ...p,
          familyId: p.familyId || `family_${p.userId || p.id}`,
          coParentInviteCode: newCoCode,
          password: needsPasswordHash
            ? hashParentPassword(p.username, p.password)
            : p.password
        };
      }
      return p;
    });

    if (migrated) {
      await AsyncStorage.setItem(PARENTS_STORAGE_KEY, JSON.stringify(updated));
    }
    return updated;
  } catch (e) {
    console.error("Failed to load parents:", e);
    return [];
  }
}

export async function getAllChildren() {
  try {
    const stored = await AsyncStorage.getItem(CHILDREN_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to load children:", e);
    return [];
  }
}

/**
 * Resolve all parent IDs and familyId for a given parentId so co-parents share full family access
 */
export async function getFamilyContextForParent(parentId) {
  const allParents = await getAllParents();
  const me = allParents.find((p) => p.userId === parentId || p.id === parentId);
  const familyId = me?.familyId || `family_${parentId}`;
  const coParents = allParents.filter(
    (p) => p.familyId === familyId || p.userId === parentId || p.id === parentId
  );
  const familyParentIds = coParents.map((p) => p.userId || p.id);

  return {
    familyId,
    coParentInviteCode: me?.coParentInviteCode || coParents[0]?.coParentInviteCode || '',
    coParents,
    familyParentIds,
    parentIds: familyParentIds
  };
}

export async function getChildrenForParent(parentId) {
  const [{ familyId, familyParentIds }, allChildren] = await Promise.all([
    getFamilyContextForParent(parentId),
    getAllChildren()
  ]);

  return allChildren.filter(
    (c) =>
      c.familyId === familyId ||
      c.parentProfileId === parentId ||
      familyParentIds.includes(c.parentProfileId)
  );
}

/**
 * Retrieve the permanently logged-in child session on this device, if one exists.
 */
export async function getPersistedChildSession() {
  try {
    const stored = await AsyncStorage.getItem(PERSISTENT_CHILD_SESSION_KEY);
    if (!stored) return null;

    const savedChild = JSON.parse(stored);
    const allChildren = await getAllChildren();
    const latestChild = allChildren.find((c) => c.id === savedChild.id);

    if (latestChild) {
      await AsyncStorage.setItem(PERSISTENT_CHILD_SESSION_KEY, JSON.stringify(latestChild));
      return latestChild;
    }
    return savedChild;
  } catch (e) {
    console.error("Failed to load persistent child session:", e);
    return null;
  }
}

/**
 * Register a new Parent Account (requires name, email, phoneNumber, age, username, password).
 * Supports EITHER:
 *  - Creating a new family + linked Child Profile, OR
 *  - Joining an existing family as a Co-Parent via `options.joinFamilyCode`
 */
export async function registerParentAccount(parentData, childData, options = {}) {
  const { name, email, phoneNumber, age, username, password } = parentData || {};
  const { name: childName, age: childAge, phoneNumber: childPhone } = childData || {};
  const { joinExistingFamily = false, coParentCodeInput = '' } = options;

  if (!name?.trim() || !email?.trim() || !phoneNumber?.trim() || !age || !username?.trim() || !password) {
    return {
      success: false,
      error: "All parent fields (Name, Email, Phone Number, Age, Username, and Password) are required."
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { success: false, error: "Please enter a valid email address." };
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return { success: false, error: "Please enter a valid parent phone number (at least 10 digits)." };
  }

  const parsedParentAge = parseInt(age, 10);
  if (isNaN(parsedParentAge) || parsedParentAge < 18 || parsedParentAge > 120) {
    return { success: false, error: "Parent age must be a valid number (18 or older)." };
  }

  if (username.trim().length < 3) {
    return { success: false, error: "Username must be at least 3 characters long." };
  }

  if (password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters long." };
  }

  const parents = await getAllParents();
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  if (parents.some((p) => p.username === normalizedUsername)) {
    return { success: false, error: "That username is already taken. Please choose another." };
  }

  if (parents.some((p) => p.email === normalizedEmail)) {
    return { success: false, error: "An account with that email already exists." };
  }

  // CASE A: Joining an existing Family via Co-Parent Code
  if (joinExistingFamily) {
    const cleanJoinCode = String(coParentCodeInput || '').trim().toUpperCase();
    if (!cleanJoinCode) {
      return { success: false, error: "Please enter the 6-character Co-Parent Family Code." };
    }

    const existingFamilyParent = parents.find((p) => p.coParentInviteCode === cleanJoinCode);
    if (!existingFamilyParent) {
      return {
        success: false,
        error: "Invalid Co-Parent Family Code. Check the code in the other parent's Profiles tab."
      };
    }

    const coParentProfile = createParentProfile({
      familyId: existingFamilyParent.familyId,
      coParentInviteCode: existingFamilyParent.coParentInviteCode,
      name,
      email,
      phoneNumber,
      age: parsedParentAge,
      username,
      password: hashParentPassword(username, password)
    });

    parents.push(coParentProfile);
    await AsyncStorage.setItem(PARENTS_STORAGE_KEY, JSON.stringify(parents));

    const linkedChildren = await getChildrenForParent(coParentProfile.userId);
    return {
      success: true,
      joinedExistingFamily: true,
      parent: coParentProfile,
      coParentInviteCode: existingFamilyParent.coParentInviteCode,
      child: linkedChildren[0] || null,
      children: linkedChildren,
      inviteCode: linkedChildren[0]?.inviteCode || null
    };
  }

  // CASE B: Creating a brand-new Family & First Linked Child Profile
  if (!childName?.trim() || !childAge || !childPhone?.trim()) {
    return {
      success: false,
      error: "Please provide your child's Name, Age, and Phone Number to text their invite link & code."
    };
  }

  const parsedChildAge = parseInt(childAge, 10);
  if (isNaN(parsedChildAge) || parsedChildAge < 3 || parsedChildAge > 18) {
    return { success: false, error: "Child age must be a valid number between 3 and 18." };
  }

  if (!isValidPhoneNumber(childPhone)) {
    return { success: false, error: "Please enter a valid child phone number (at least 10 digits)." };
  }

  const children = await getAllChildren();
  const existingCodes = [
    ...children.map((c) => c.inviteCode),
    ...parents.map((p) => p.coParentInviteCode)
  ].filter(Boolean);

  const coParentInviteCode = generateChildInviteCode(existingCodes);
  existingCodes.push(coParentInviteCode);
  const inviteCode = generateChildInviteCode(existingCodes);

  const familyId = `family_${Date.now()}`;

  const parentProfile = createParentProfile({
    familyId,
    coParentInviteCode,
    name,
    email,
    phoneNumber,
    age: parsedParentAge,
    username,
    password: hashParentPassword(username, password)
  });

  const childProfile = createChildProfile({
    familyId,
    parentProfileId: parentProfile.userId,
    name: childName,
    age: parsedChildAge,
    phoneNumber: childPhone,
    inviteCode
  });

  parents.push(parentProfile);
  children.push(childProfile);

  await AsyncStorage.setItem(PARENTS_STORAGE_KEY, JSON.stringify(parents));
  await AsyncStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(children));
  await saveParentSettings(parentProfile.userId, DEFAULT_PARENT_SETTINGS);

  return {
    success: true,
    joinedExistingFamily: false,
    parent: parentProfile,
    coParentInviteCode,
    child: childProfile,
    inviteCode
  };
}

/**
 * Authenticate a Parent by Username and Password
 */
export async function loginParent(username, password) {
  if (!username?.trim() || !password) {
    return { success: false, error: "Please enter both your username and password." };
  }

  const parents = await getAllParents();
  const normalizedUsername = username.trim().toLowerCase();
  const expectedHash = hashParentPassword(normalizedUsername, password);

  const matchedParent = parents.find(
    (p) =>
      p.username === normalizedUsername &&
      (p.password === expectedHash || p.password === password)
  );

  if (!matchedParent) {
    return { success: false, error: "Invalid username or password." };
  }

  const linkedChildren = await getChildrenForParent(matchedParent.userId);
  return {
    success: true,
    parent: matchedParent,
    children: linkedChildren
  };
}

/**
 * Update Parent Account Profile (Name, Email, Phone Number, Age, Username, and optional New Password)
 */
export async function updateParentAccount(parentId, { name, email, phoneNumber, age, username, newPassword }) {
  if (!parentId) {
    return { success: false, error: "Missing parent ID." };
  }
  if (!name?.trim() || !email?.trim() || !phoneNumber?.trim() || !age || !username?.trim()) {
    return { success: false, error: "Name, Email, Phone Number, Age, and Username are required." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { success: false, error: "Please enter a valid email address." };
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return { success: false, error: "Please enter a valid phone number (at least 10 digits)." };
  }

  const parsedAge = parseInt(age, 10);
  if (isNaN(parsedAge) || parsedAge < 18 || parsedAge > 120) {
    return { success: false, error: "Parent age must be 18 or older." };
  }

  if (username.trim().length < 3) {
    return { success: false, error: "Username must be at least 3 characters long." };
  }

  if (newPassword && newPassword.length < 6) {
    return { success: false, error: "New password must be at least 6 characters long." };
  }

  const parents = await getAllParents();
  const idx = parents.findIndex((p) => p.userId === parentId || p.id === parentId);
  if (idx === -1) {
    return { success: false, error: "Parent account not found." };
  }

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  if (parents.some((p, i) => i !== idx && p.username === normalizedUsername)) {
    return { success: false, error: "That username is already in use by another account." };
  }

  if (parents.some((p, i) => i !== idx && p.email === normalizedEmail)) {
    return { success: false, error: "That email is already in use by another account." };
  }

  const updatedParent = {
    ...parents[idx],
    name: name.trim(),
    displayName: name.trim(),
    email: normalizedEmail,
    phoneNumber: normalizePhoneNumber(phoneNumber),
    age: parsedAge,
    username: normalizedUsername,
    password: newPassword
      ? hashParentPassword(normalizedUsername, newPassword)
      : parents[idx].password,
    updatedAt: new Date().toISOString()
  };

  parents[idx] = updatedParent;
  await AsyncStorage.setItem(PARENTS_STORAGE_KEY, JSON.stringify(parents));

  return { success: true, parent: updatedParent };
}

/**
 * Get and Save Family / Parent App & Notification Settings
 */
export async function getParentSettings(parentOrFamilyId) {
  if (!parentOrFamilyId) return { ...DEFAULT_PARENT_SETTINGS };
  try {
    const { familyId } = await getFamilyContextForParent(parentOrFamilyId);
    const rawFamily = await AsyncStorage.getItem(`${PARENT_SETTINGS_PREFIX}${familyId}`);
    if (rawFamily) {
      return { ...DEFAULT_PARENT_SETTINGS, ...JSON.parse(rawFamily) };
    }
    const rawParent = await AsyncStorage.getItem(`${PARENT_SETTINGS_PREFIX}${parentOrFamilyId}`);
    return rawParent
      ? { ...DEFAULT_PARENT_SETTINGS, ...JSON.parse(rawParent) }
      : { ...DEFAULT_PARENT_SETTINGS };
  } catch (e) {
    console.error("Failed to load parent settings:", e);
    return { ...DEFAULT_PARENT_SETTINGS };
  }
}

export async function saveParentSettings(parentId, newSettings) {
  if (!parentId) return { success: false, error: "Missing parent ID" };
  try {
    const { familyId } = await getFamilyContextForParent(parentId);
    const merged = { ...DEFAULT_PARENT_SETTINGS, ...newSettings };
    await AsyncStorage.setItem(`${PARENT_SETTINGS_PREFIX}${familyId}`, JSON.stringify(merged));
    await AsyncStorage.setItem(`${PARENT_SETTINGS_PREFIX}${parentId}`, JSON.stringify(merged));
    return { success: true, settings: merged };
  } catch (e) {
    console.error("Failed to save parent settings:", e);
    return { success: false, error: e.message };
  }
}

/**
 * Allow any co-parent in the family to create or update a linked child profile (with phoneNumber)
 */
export async function saveChildForParent(parentId, { childId, name, age, phoneNumber }) {
  if (!parentId) {
    return { success: false, error: "Missing parent account ID." };
  }
  const parsedAge = parseInt(age, 10);
  if (!name?.trim() || isNaN(parsedAge) || parsedAge < 3 || parsedAge > 18) {
    return { success: false, error: "Please enter a valid child name and age (3-18)." };
  }
  if (!phoneNumber?.trim() || !isValidPhoneNumber(phoneNumber)) {
    return { success: false, error: "Please enter a valid child phone number (at least 10 digits) for texting invites." };
  }

  const [{ familyId, familyParentIds }, children] = await Promise.all([
    getFamilyContextForParent(parentId),
    getAllChildren()
  ]);

  if (childId) {
    const idx = children.findIndex(
      (c) =>
        c.id === childId &&
        (c.familyId === familyId ||
          c.parentProfileId === parentId ||
          familyParentIds.includes(c.parentProfileId))
    );
    if (idx === -1) {
      return { success: false, error: "Child profile not found." };
    }
    children[idx] = {
      ...children[idx],
      familyId,
      name: name.trim(),
      displayName: name.trim(),
      age: parsedAge,
      phoneNumber: normalizePhoneNumber(phoneNumber)
    };
    await AsyncStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(children));

    const persisted = await getPersistedChildSession();
    if (persisted && persisted.id === childId) {
      await AsyncStorage.setItem(PERSISTENT_CHILD_SESSION_KEY, JSON.stringify(children[idx]));
    }

    return { success: true, child: children[idx] };
  } else {
    const existingCodes = children.map((c) => c.inviteCode);
    const inviteCode = generateChildInviteCode(existingCodes);
    const newChild = createChildProfile({
      familyId,
      parentProfileId: parentId,
      name,
      age: parsedAge,
      phoneNumber,
      inviteCode
    });
    children.push(newChild);
    await AsyncStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(children));
    return { success: true, child: newChild };
  }
}

/**
 * Allow a co-parent in the family to issue a fresh one-time invite code for a child
 */
export async function regenerateChildInviteCode(parentId, childId) {
  const [{ familyId, familyParentIds }, children] = await Promise.all([
    getFamilyContextForParent(parentId),
    getAllChildren()
  ]);

  const idx = children.findIndex(
    (c) =>
      c.id === childId &&
      (c.familyId === familyId ||
        c.parentProfileId === parentId ||
        familyParentIds.includes(c.parentProfileId))
  );
  if (idx === -1) {
    return { success: false, error: "Child profile not found." };
  }

  const existingCodes = children.map((c) => c.inviteCode);
  const newCode = generateChildInviteCode(existingCodes);

  children[idx] = {
    ...children[idx],
    inviteCode: newCode,
    inviteCodeUsed: false,
    claimedAt: null
  };

  await AsyncStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(children));
  return { success: true, child: children[idx], inviteCode: newCode };
}

/**
 * Allow a co-parent in the family to directly link or switch the active permanent child on this device
 */
export async function linkDeviceToChildByParent(parentId, childId) {
  const [{ familyId, familyParentIds }, children] = await Promise.all([
    getFamilyContextForParent(parentId),
    getAllChildren()
  ]);

  const idx = children.findIndex(
    (c) =>
      c.id === childId &&
      (c.familyId === familyId ||
        c.parentProfileId === parentId ||
        familyParentIds.includes(c.parentProfileId))
  );
  if (idx === -1) {
    return { success: false, error: "Child profile not found." };
  }

  const updatedChild = {
    ...children[idx],
    inviteCodeUsed: true,
    claimedAt: children[idx].claimedAt || new Date().toISOString()
  };

  children[idx] = updatedChild;
  await AsyncStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(children));
  await AsyncStorage.setItem(PERSISTENT_CHILD_SESSION_KEY, JSON.stringify(updatedChild));

  return { success: true, child: updatedChild };
}

/**
 * Verify a one-time child invite code, mark it as consumed so it cannot be reused,
 * and permanently log the child in on this device.
 */
export async function verifyAndClaimChildInvite(enteredCode) {
  if (!enteredCode?.trim()) {
    return { success: false, error: "Please enter your 6-character invite code." };
  }
  const code = enteredCode.trim().toUpperCase();

  const children = await getAllChildren();
  const idx = children.findIndex((c) => c.inviteCode === code);

  if (idx === -1) {
    return {
      success: false,
      error: "Invalid invite code. Ask your parent for the 6-character code from their Parent Dashboard."
    };
  }

  const matchedChild = children[idx];

  if (matchedChild.inviteCodeUsed) {
    return {
      success: false,
      error: "This one-time invite code has already been used to permanently link a device and cannot be reused. Ask your parent to generate a new code if needed."
    };
  }

  const claimedChild = {
    ...matchedChild,
    inviteCodeUsed: true,
    claimedAt: new Date().toISOString()
  };

  children[idx] = claimedChild;
  await AsyncStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(children));
  await AsyncStorage.setItem(PERSISTENT_CHILD_SESSION_KEY, JSON.stringify(claimedChild));

  return {
    success: true,
    child: claimedChild
  };
}

/**
 * Permanently delete a parent account and associated family/child data (Apple App Store & Google Play compliance).
 * When `deleteEntireFamily` is true (or if this is the sole parent in the household), all linked child profiles,
 * reading history, libraries, rewards, and notifications for the family are permanently erased.
 */
export async function deleteParentAccountAndData(parentId, { deleteEntireFamily = true } = {}) {
  if (!parentId) {
    return { success: false, error: "Missing parent account ID." };
  }

  try {
    const [allParents, allChildren, familyCtx] = await Promise.all([
      getAllParents(),
      getAllChildren(),
      getFamilyContextForParent(parentId)
    ]);

    const { familyId, coParents, familyParentIds } = familyCtx;
    const isSoleParent = (coParents?.length || 1) <= 1;
    const purgeWholeFamily = deleteEntireFamily || isSoleParent;

    if (!purgeWholeFamily) {
      // Remove only this co-parent login while preserving the rest of the household
      const remainingParents = allParents.filter(
        (p) => p.userId !== parentId && p.id !== parentId
      );
      await AsyncStorage.setItem(PARENTS_STORAGE_KEY, JSON.stringify(remainingParents));
      await AsyncStorage.removeItem(`${PARENT_SETTINGS_PREFIX}${parentId}`);
      await AsyncStorage.removeItem(`@parent_notifications_${parentId}`);
      return {
        success: true,
        deletedEntireFamily: false,
        clearedDeviceChildSession: false
      };
    }

    // Remove all parents and children belonging to this family
    const familyChildren = allChildren.filter(
      (c) =>
        c.familyId === familyId ||
        c.parentProfileId === parentId ||
        familyParentIds.includes(c.parentProfileId)
    );
    const deletedChildIds = familyChildren.map((c) => c.id);

    const remainingParents = allParents.filter(
      (p) =>
        p.familyId !== familyId &&
        p.userId !== parentId &&
        p.id !== parentId &&
        !familyParentIds.includes(p.userId || p.id)
    );
    const remainingChildren = allChildren.filter((c) => !deletedChildIds.includes(c.id));

    await AsyncStorage.setItem(PARENTS_STORAGE_KEY, JSON.stringify(remainingParents));
    await AsyncStorage.setItem(CHILDREN_STORAGE_KEY, JSON.stringify(remainingChildren));

    // Check if the persisted child on this device belongs to the deleted family
    let clearedDeviceChildSession = false;
    const persistedRaw = await AsyncStorage.getItem(PERSISTENT_CHILD_SESSION_KEY);
    if (persistedRaw) {
      const persistedChild = JSON.parse(persistedRaw);
      if (
        deletedChildIds.includes(persistedChild?.id) ||
        persistedChild?.familyId === familyId ||
        familyParentIds.includes(persistedChild?.parentProfileId)
      ) {
        await AsyncStorage.removeItem(PERSISTENT_CHILD_SESSION_KEY);
        clearedDeviceChildSession = true;
      }
    }

    // Clean up reading sessions history & live reading map for deleted children
    const [storedHistoryRaw, storedLiveRaw] = await Promise.all([
      AsyncStorage.getItem('@reading_sessions_history'),
      AsyncStorage.getItem('@child_live_reading_status')
    ]);

    if (storedHistoryRaw) {
      const history = JSON.parse(storedHistoryRaw);
      const filteredHistory = history.filter(
        (s) =>
          s.familyId !== familyId &&
          !familyParentIds.includes(s.parentProfileId) &&
          !deletedChildIds.includes(s.childId)
      );
      await AsyncStorage.setItem('@reading_sessions_history', JSON.stringify(filteredHistory));
    }

    if (storedLiveRaw) {
      const liveMap = JSON.parse(storedLiveRaw);
      deletedChildIds.forEach((cId) => {
        delete liveMap[cId];
      });
      await AsyncStorage.setItem('@child_live_reading_status', JSON.stringify(liveMap));
    }

    // Remove per-child keys & family/parent notification/settings keys
    const keysToRemove = [
      `${PARENT_SETTINGS_PREFIX}${familyId}`,
      `${PARENT_SETTINGS_PREFIX}${parentId}`,
      `@parent_notifications_${familyId}`,
      `@parent_notifications_${parentId}`
    ];

    familyParentIds.forEach((pId) => {
      keysToRemove.push(`${PARENT_SETTINGS_PREFIX}${pId}`);
      keysToRemove.push(`@parent_notifications_${pId}`);
    });

    deletedChildIds.forEach((cId) => {
      keysToRemove.push(
        `@child_book_library_${cId}`,
        `@child_library_${cId}`,
        `@child_rewards_list_${cId}`,
        `@child_reward_goal_${cId}`,
        `@child_reward_${cId}`,
        `@child_reminders_${cId}`,
        `@last_reading_session_${cId}`
      );
    });

    await AsyncStorage.multiRemove(keysToRemove);

    return {
      success: true,
      deletedEntireFamily: true,
      clearedDeviceChildSession
    };
  } catch (e) {
    console.error("Failed to delete parent account and family data:", e);
    return {
      success: false,
      error: "An error occurred while deleting account data."
    };
  }
}
