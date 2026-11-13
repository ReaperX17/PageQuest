/**
 * Core Data Models & Builders for Parent-Child Reading Tracker & Quiz App
 */

export const UserSchema = {
  userId: "string",
  familyId: "string", // Shared across co-parents and children in the same household
  parentProfileId: "string | null", // null if parent account, creator parent's userId if child account
  role: "parent | child",
  displayName: "string",
  email: "string | null", // required for parent
  phoneNumber: "string", // required for parent and child SMS invite/access links
  username: "string | null", // required for parent
  age: "number", // required for both parent and child
  inviteCode: "string | null", // one-time code used by child to permanently log in
  coParentInviteCode: "string | null", // shared family code used to link additional parents/guardians
  inviteCodeUsed: "boolean", // true once the one-time invite code has been claimed
  claimedAt: "timestamp | null",
  createdAt: "timestamp"
};

export const ReadingSessionSchema = {
  sessionId: "string",
  familyId: "string",
  parentProfileId: "string",
  childId: "string",
  childName: "string",
  childAge: "number",
  bookTitle: "string",
  author: "string",
  readingRange: {
    startingPage: "number",
    currentPage: "number",
    endingPage: "number | null"
  },
  durationMinutes: "number",
  readingNote: "string",
  status: "started_reading | quiz_started | completed",
  quizData: {
    questions: [],
    userAnswers: {},
    score: "number",
    passed: "boolean" // true if score >= 90%
  },
  timestamps: {
    startedReadingAt: "timestamp",
    updatedPageAt: "timestamp | null",
    quizStartedAt: "timestamp | null",
    completedAt: "timestamp | null"
  }
};

export function normalizePhoneNumber(phone = '') {
  return String(phone).trim();
}

export function isValidPhoneNumber(phone = '') {
  const digitsOnly = String(phone).replace(/\D/g, '');
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
}

export function createParentProfile({
  userId,
  familyId,
  coParentInviteCode,
  name,
  email,
  phoneNumber,
  age,
  username,
  password,
  passwordHash
}) {
  const id = userId || `parent_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  const famId = familyId || `family_${Date.now()}`;
  return {
    userId: id,
    id,
    familyId: famId,
    coParentInviteCode: coParentInviteCode || null,
    parentProfileId: null,
    role: 'parent',
    displayName: name.trim(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phoneNumber: normalizePhoneNumber(phoneNumber),
    username: username.trim().toLowerCase(),
    password: password || passwordHash || '', // Stored locally for device authentication
    age: Number(age),
    createdAt: new Date().toISOString()
  };
}

export function createChildProfile({
  userId,
  familyId,
  parentProfileId,
  name,
  age,
  phoneNumber,
  inviteCode
}) {
  const id = userId || `child_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    userId: id,
    id,
    familyId: familyId || parentProfileId,
    parentProfileId,
    role: 'child',
    displayName: name.trim(),
    name: name.trim(),
    age: Number(age),
    phoneNumber: normalizePhoneNumber(phoneNumber),
    inviteCode,
    inviteCodeUsed: false,
    claimedAt: null,
    permissions: ['update_book', 'update_pages', 'activate_and_take_quiz'],
    createdAt: new Date().toISOString()
  };
}

export function createReadingSession({
  sessionId,
  familyId,
  parentProfileId,
  childId,
  childName,
  childAge,
  bookTitle,
  author,
  startingPage,
  currentPage = null,
  endingPage = null,
  durationMinutes = 1,
  readingNote = '',
  status = 'started_reading',
  quizResult = null,
  startedReadingAt = null,
  updatedPageAt = null,
  quizStartedAt = null,
  completedAt = null
}) {
  const startPg = Number(startingPage);
  const currPg =
    currentPage !== null
      ? Number(currentPage)
      : endingPage !== null
      ? Number(endingPage)
      : startPg;
  const endPg = endingPage !== null ? Number(endingPage) : null;

  return {
    sessionId: sessionId || `session_${Date.now()}`,
    familyId: familyId || parentProfileId || 'family_default',
    parentProfileId: parentProfileId || 'parent_default',
    childId: childId || 'child_default',
    childName: childName || 'Reader',
    childAge: Number(childAge) || 8,
    bookTitle: bookTitle.trim(),
    author: author.trim(),
    startingPage: startPg,
    currentPage: currPg,
    endingPage: endPg,
    durationMinutes: Math.max(1, Number(durationMinutes) || 1),
    readingNote: String(readingNote || '').trim(),
    readingRange: {
      startingPage: startPg,
      currentPage: currPg,
      endingPage: endPg
    },
    status,
    quizResult,
    timestamps: {
      startedReadingAt: startedReadingAt || new Date().toISOString(),
      updatedPageAt: updatedPageAt || new Date().toISOString(),
      quizStartedAt,
      completedAt
    },
    completedAt: completedAt || new Date().toISOString()
  };
}
