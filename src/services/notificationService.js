import { cloudStorage as AsyncStorage } from '../config/firebaseConfig';
import { getParentSettings, getFamilyContextForParent } from './authService';

/**
 * Parent Notification, Child Reading Reminder, Rewards, Streaks & Library Service
 */

const NOTIFICATIONS_STORAGE_KEY = '@parent_notifications';
const CHILD_REMINDERS_KEY = '@child_reading_reminders';
const CHILD_LIBRARY_PREFIX = '@child_book_library_';
const CHILD_REWARD_PREFIX = '@child_reward_goal_';
const CHILD_REWARDS_LIST_PREFIX = '@child_rewards_list_';

export const DEFAULT_CHILD_REWARD = {
  title: 'Pick Friday Family Movie & Treat! 🍕🎬',
  targetQuizzes: 5
};

export const DEFAULT_CHILD_REWARDS_LIST = [
  {
    id: 'rew_milestone_1',
    title: 'Ice Cream or Smoothie Treat! 🍦',
    targetQuizzes: 3,
    status: 'active', // 'active' | 'requested' | 'denied'
    claimed: false,
    requestedBy: 'parent',
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'rew_milestone_2',
    title: 'Pick Friday Family Movie & Pizza! 🍕🎬',
    targetQuizzes: 5,
    status: 'active',
    claimed: false,
    requestedBy: 'parent',
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'rew_milestone_3',
    title: 'New Book or Game of Your Choice! 📚🎮',
    targetQuizzes: 10,
    status: 'active',
    claimed: false,
    requestedBy: 'parent',
    createdAt: '2026-01-01T00:00:00.000Z'
  }
];

function sortRewardsList(list = []) {
  return [...list].sort((a, b) => {
    // Put pending child requests first for visibility, then sort by targetQuizzes ascending
    if (a.status === 'requested' && b.status !== 'requested') return -1;
    if (b.status === 'requested' && a.status !== 'requested') return 1;
    return (Number(a.targetQuizzes) || 1) - (Number(b.targetQuizzes) || 1);
  });
}

export async function getChildRewards(childId) {
  if (!childId) return [...DEFAULT_CHILD_REWARDS_LIST];
  try {
    const rawList = await AsyncStorage.getItem(`${CHILD_REWARDS_LIST_PREFIX}${childId}`);
    if (rawList) {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sortRewardsList(parsed);
      }
    }

    // Check legacy single reward goal and include it if customized
    const rawSingle = await AsyncStorage.getItem(`${CHILD_REWARD_PREFIX}${childId}`);
    let initialList = [...DEFAULT_CHILD_REWARDS_LIST];
    if (rawSingle) {
      const single = JSON.parse(rawSingle);
      if (
        single?.title &&
        !initialList.some((r) => r.title.toLowerCase() === single.title.toLowerCase())
      ) {
        initialList.push({
          id: `rew_${Date.now()}`,
          title: single.title,
          targetQuizzes: Math.max(1, Number(single.targetQuizzes) || 5),
          status: 'active',
          claimed: false,
          requestedBy: 'parent',
          createdAt: single.updatedAt || new Date().toISOString()
        });
      }
    }

    const sorted = sortRewardsList(initialList);
    await AsyncStorage.setItem(`${CHILD_REWARDS_LIST_PREFIX}${childId}`, JSON.stringify(sorted));
    return sorted;
  } catch (e) {
    console.error("Failed to load child rewards list:", e);
    return [...DEFAULT_CHILD_REWARDS_LIST];
  }
}

/**
 * Pure helper to pick the next active unclaimed reward milestone for a child
 */
export function selectNextActiveReward(rewardsList = [], passedQuizzesCount = 0) {
  const activeRewards = (Array.isArray(rewardsList) ? rewardsList : [])
    .filter((r) => r.status === 'active')
    .sort((a, b) => (Number(a.targetQuizzes) || 1) - (Number(b.targetQuizzes) || 1));

  if (activeRewards.length === 0) {
    return { ...DEFAULT_CHILD_REWARD };
  }

  return (
    activeRewards.find((r) => !r.claimed && Number(r.targetQuizzes) > passedQuizzesCount) ||
    activeRewards.find((r) => !r.claimed) ||
    activeRewards[activeRewards.length - 1]
  );
}

/**
 * Returns the primary/next active reward milestone for a child (used by summary progress bars)
 */
export async function getChildRewardGoal(childId, passedQuizzesCount = 0) {
  if (!childId) return { ...DEFAULT_CHILD_REWARD };
  try {
    const list = await getChildRewards(childId);
    return selectNextActiveReward(list, passedQuizzesCount);
  } catch (e) {
    return { ...DEFAULT_CHILD_REWARD };
  }
}

/**
 * Add a new parent-set reward milestone or edit an existing reward milestone
 */
export async function saveChildRewardItem(childId, { rewardId = null, title, targetQuizzes }) {
  if (!childId) return { success: false, error: "Missing child ID." };
  if (!title || !String(title).trim()) {
    return { success: false, error: "Please enter a reward description." };
  }

  const cleanTitle = String(title).trim();
  const cleanTarget = Math.max(1, parseInt(targetQuizzes, 10) || 5);
  const list = await getChildRewards(childId);

  let savedItem = null;
  let updatedList = [];

  if (rewardId) {
    updatedList = list.map((r) => {
      if (r.id === rewardId) {
        savedItem = {
          ...r,
          title: cleanTitle,
          targetQuizzes: cleanTarget,
          status: 'active',
          updatedAt: new Date().toISOString()
        };
        return savedItem;
      }
      return r;
    });
  } else {
    savedItem = {
      id: `rew_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle,
      targetQuizzes: cleanTarget,
      status: 'active',
      claimed: false,
      requestedBy: 'parent',
      createdAt: new Date().toISOString()
    };
    updatedList = [...list, savedItem];
  }

  const sorted = sortRewardsList(updatedList);
  await AsyncStorage.setItem(`${CHILD_REWARDS_LIST_PREFIX}${childId}`, JSON.stringify(sorted));
  await AsyncStorage.setItem(`${CHILD_REWARD_PREFIX}${childId}`, JSON.stringify(savedItem));

  return { success: true, reward: savedItem, rewards: sorted };
}

/**
 * Legacy helper so any call to saveChildRewardGoal adds/updates a reward cleanly
 */
export async function saveChildRewardGoal(childId, { rewardId = null, title, targetQuizzes }) {
  const res = await saveChildRewardItem(childId, { rewardId, title, targetQuizzes });
  return { success: res.success, goal: res.reward, rewards: res.rewards, error: res.error };
}

/**
 * Delete a reward or milestone from a child's list
 */
export async function deleteChildRewardItem(childId, rewardId) {
  if (!childId || !rewardId) return { success: false, error: "Missing reward ID." };
  const list = await getChildRewards(childId);
  const filtered = list.filter((r) => r.id !== rewardId);
  await AsyncStorage.setItem(`${CHILD_REWARDS_LIST_PREFIX}${childId}`, JSON.stringify(filtered));
  return { success: true, rewards: filtered };
}

/**
 * Mark an unlocked reward as Claimed / Redeemed (or toggle back)
 */
export async function toggleClaimChildRewardItem(childId, rewardId) {
  if (!childId || !rewardId) return { success: false, error: "Missing reward ID." };
  const list = await getChildRewards(childId);
  const updated = list.map((r) => {
    if (r.id === rewardId) {
      const nextClaimed = !r.claimed;
      return {
        ...r,
        claimed: nextClaimed,
        claimedAt: nextClaimed ? new Date().toISOString() : null
      };
    }
    return r;
  });
  const sorted = sortRewardsList(updated);
  await AsyncStorage.setItem(`${CHILD_REWARDS_LIST_PREFIX}${childId}`, JSON.stringify(sorted));
  return { success: true, rewards: sorted };
}

/**
 * Allow a child to request a custom reward that parents can Approve or Deny
 */
export async function requestRewardByChild({
  childId,
  childName,
  parentProfileId,
  familyId,
  title,
  suggestedTargetQuizzes = 5
}) {
  if (!childId) return { success: false, error: "Missing child profile." };
  if (!title || !String(title).trim()) {
    return { success: false, error: "Please type what reward you would like to request!" };
  }

  const cleanTitle = String(title).trim();
  const cleanTarget = Math.max(1, parseInt(suggestedTargetQuizzes, 10) || 5);
  const list = await getChildRewards(childId);

  const newRequest = {
    id: `rew_req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: cleanTitle,
    targetQuizzes: cleanTarget,
    status: 'requested', // Pending parent approval
    claimed: false,
    requestedBy: 'child',
    childName: childName || 'Reader',
    createdAt: new Date().toISOString()
  };

  const sorted = sortRewardsList([newRequest, ...list]);
  await AsyncStorage.setItem(`${CHILD_REWARDS_LIST_PREFIX}${childId}`, JSON.stringify(sorted));

  // Notify Parents / Co-Parents in the family household
  await sendParentPushNotification(
    "🎁 New Child Reward Request",
    `${childName || 'Your child'} requested a reward: "${cleanTitle}" (Suggested goal: ${cleanTarget} passed quizzes). Open the Profiles tab to Approve or Deny!`,
    {
      familyId: familyId || '',
      parentProfileId: parentProfileId || '',
      childId,
      eventType: 'REWARD_REQUESTED'
    }
  );

  return { success: true, request: newRequest, rewards: sorted };
}

/**
 * Allow a parent or co-parent to Approve or Deny a child's reward request
 */
export async function reviewChildRewardRequest(
  childId,
  rewardId,
  { action, targetQuizzes = null, title = null }
) {
  if (!childId || !rewardId) {
    return { success: false, error: "Missing child or reward ID." };
  }

  const list = await getChildRewards(childId);
  let reviewedItem = null;

  const updated = list.map((r) => {
    if (r.id === rewardId) {
      const nextStatus = action === 'approve' ? 'active' : 'denied';
      reviewedItem = {
        ...r,
        title: title && String(title).trim() ? String(title).trim() : r.title,
        targetQuizzes:
          targetQuizzes !== null
            ? Math.max(1, parseInt(targetQuizzes, 10) || r.targetQuizzes || 5)
            : r.targetQuizzes,
        status: nextStatus,
        reviewedAt: new Date().toISOString()
      };
      return reviewedItem;
    }
    return r;
  });

  const sorted = sortRewardsList(updated);
  await AsyncStorage.setItem(`${CHILD_REWARDS_LIST_PREFIX}${childId}`, JSON.stringify(sorted));
  return { success: true, reward: reviewedItem, rewards: sorted };
}

/**
 * Compute daily page progress, consecutive day streak, and total minutes read for a child
 */
export function computeChildReadingStats(sessions = [], dailyPageGoal = 15, extraPagesToday = 0) {
  const goal = Math.max(1, Number(dailyPageGoal) || 15);
  const todayStr = new Date().toISOString().slice(0, 10);

  let pagesReadToday = Math.max(0, Number(extraPagesToday) || 0);
  let totalPagesRead = pagesReadToday;
  let totalMinutesRead = 0;
  const activeDaySet = new Set();
  const seenRangesToday = new Set();

  if (pagesReadToday > 0) {
    activeDaySet.add(todayStr);
  }

  sessions.forEach((s) => {
    const startPg = Number(s.startingPage) || 1;
    const endPg = Number(s.endingPage) || Number(s.currentPage) || startPg;
    const pages = Math.max(1, endPg - startPg + 1);
    const mins = Math.max(1, Number(s.durationMinutes) || 1);

    totalMinutesRead += mins;

    const dateStr = (s.completedAt || s.timestamps?.startedReadingAt || '').slice(0, 10);
    const rangeKey = `${(s.bookTitle || '').toLowerCase()}_${startPg}_${endPg}_${dateStr}`;

    // Avoid double-counting pages if the child retried the exact same page range on the same day
    if (!seenRangesToday.has(rangeKey)) {
      seenRangesToday.add(rangeKey);
      totalPagesRead += pages;
      if (dateStr === todayStr) {
        pagesReadToday += pages;
      }
    }

    if (dateStr) {
      activeDaySet.add(dateStr);
    }
  });

  // Compute consecutive day streak up to today/yesterday
  let streakDays = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const dStr = cursor.toISOString().slice(0, 10);
    if (activeDaySet.has(dStr)) {
      streakDays++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      // Allow streak to continue if they read yesterday and haven't finished today's session yet
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  const dailyGoalPercent = Math.min(100, Math.round((pagesReadToday / goal) * 100));

  return {
    pagesReadToday,
    dailyPageGoal: goal,
    dailyGoalPercent,
    streakDays,
    totalPagesRead,
    totalMinutesRead
  };
}

export async function getParentNotifications(parentProfileId = null) {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const all = stored ? JSON.parse(stored) : [];
    if (!parentProfileId) return all;

    const { familyId, familyParentIds } = await getFamilyContextForParent(parentProfileId);
    return all.filter(
      (n) =>
        !n.data?.parentProfileId ||
        n.data.parentProfileId === parentProfileId ||
        n.data.familyId === familyId ||
        familyParentIds.includes(n.data.parentProfileId)
    );
  } catch (error) {
    console.error("Failed to fetch parent notifications:", error);
    return [];
  }
}

export async function markAllParentNotificationsRead(parentProfileId) {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const all = stored ? JSON.parse(stored) : [];
    const { familyId, familyParentIds } = await getFamilyContextForParent(parentProfileId);

    const updated = all.map((n) => {
      if (
        !parentProfileId ||
        n.data?.parentProfileId === parentProfileId ||
        n.data?.familyId === familyId ||
        familyParentIds.includes(n.data?.parentProfileId)
      ) {
        return { ...n, read: true };
      }
      return n;
    });
    await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
    return await getParentNotifications(parentProfileId);
  } catch (error) {
    console.error("Failed to mark notifications read:", error);
    return [];
  }
}

export async function clearParentNotifications(parentProfileId) {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const all = stored ? JSON.parse(stored) : [];
    const { familyId, familyParentIds } = await getFamilyContextForParent(parentProfileId);

    const remaining = parentProfileId
      ? all.filter(
          (n) =>
            n.data?.parentProfileId !== parentProfileId &&
            n.data?.familyId !== familyId &&
            !familyParentIds.includes(n.data?.parentProfileId)
        )
      : [];
    await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(remaining));
    return [];
  } catch (error) {
    console.error("Failed to clear parent notifications:", error);
    return [];
  }
}

export async function sendParentPushNotification(title, body, customData = {}) {
  const newNotification = {
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title,
    body,
    read: false,
    data: {
      familyId: customData.familyId || '',
      parentProfileId: customData.parentProfileId || '',
      sessionId: customData.sessionId || '',
      childId: customData.childId || '',
      eventType: customData.eventType || 'GENERAL_UPDATE'
    },
    createdAt: new Date().toISOString()
  };

  try {
    const stored = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const existing = stored ? JSON.parse(stored) : [];
    const updated = [newNotification, ...existing].slice(0, 100);
    await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
    return { success: true, notification: newNotification };
  } catch (error) {
    console.error("Error saving parent notification:", error);
    return { success: false, error: error.message };
  }
}

export async function handleChildStartedReading(sessionData) {
  const settings = await getParentSettings(sessionData.parentProfileId);
  if (settings && settings.notifyOnReadingStart === false) {
    return { success: true, skipped: true };
  }

  const title = "📖 Reading Started";
  const body = `${sessionData.childName || 'Your child'} started reading "${sessionData.bookTitle}" by ${sessionData.author} at page ${sessionData.startingPage}.`;
  return await sendParentPushNotification(title, body, {
    familyId: sessionData.familyId,
    parentProfileId: sessionData.parentProfileId,
    sessionId: sessionData.sessionId,
    childId: sessionData.childId,
    eventType: 'STARTED_READING'
  });
}

export async function handleChildUpdatedPage(sessionData) {
  const settings = await getParentSettings(sessionData.parentProfileId);
  if (settings && settings.notifyOnPageUpdate === false) {
    return { success: true, skipped: true };
  }

  const title = "🔖 Page Progress Updated";
  const body = `${sessionData.childName || 'Your child'} reached page ${sessionData.currentPage} in "${sessionData.bookTitle}".`;
  return await sendParentPushNotification(title, body, {
    familyId: sessionData.familyId,
    parentProfileId: sessionData.parentProfileId,
    sessionId: sessionData.sessionId,
    childId: sessionData.childId,
    eventType: 'PAGE_UPDATED'
  });
}

export async function handleChildStartedQuiz(sessionData) {
  const settings = await getParentSettings(sessionData.parentProfileId);
  if (settings && settings.notifyOnQuizComplete === false) {
    return { success: true, skipped: true };
  }

  const noteSnippet = sessionData.readingNote ? ` • Note: "${sessionData.readingNote}"` : '';
  const title = "📝 Quiz Activated";
  const body = `${sessionData.childName || 'Your child'} read pages ${sessionData.startingPage}-${sessionData.endingPage} of "${sessionData.bookTitle}" (${sessionData.durationMinutes || 1}m)${noteSnippet} and started their quiz.`;
  return await sendParentPushNotification(title, body, {
    familyId: sessionData.familyId,
    parentProfileId: sessionData.parentProfileId,
    sessionId: sessionData.sessionId,
    childId: sessionData.childId,
    eventType: 'QUIZ_STARTED'
  });
}

export async function handleChildCompletedQuiz(sessionData, quizResult) {
  const settings = await getParentSettings(sessionData.parentProfileId);
  if (settings && settings.notifyOnQuizComplete === false) {
    return { success: true, skipped: true };
  }

  const statusLabel = quizResult.passed ? "PASSED 🌟" : "NEEDS REVIEW 📚";
  const title = `Quiz Completed (${statusLabel})`;
  const body = `${sessionData.childName || 'Your child'} scored ${quizResult.scorePercentage}% (${quizResult.correctCount}/${quizResult.totalQuestions}) on "${sessionData.bookTitle}" (pp. ${sessionData.startingPage}-${sessionData.endingPage}, ${sessionData.durationMinutes || 1}m read).`;
  return await sendParentPushNotification(title, body, {
    familyId: sessionData.familyId,
    parentProfileId: sessionData.parentProfileId,
    sessionId: sessionData.sessionId,
    childId: sessionData.childId,
    eventType: 'QUIZ_COMPLETED'
  });
}

/**
 * Child Reading Reminders (Sent or Scheduled by Any Co-Parent for Child Profiles)
 */
export async function sendReadingReminderToChild({
  familyId,
  parentProfileId,
  childId,
  childName,
  message,
  scheduledTime = null
}) {
  if (!childId) {
    return { success: false, error: "Please select a child profile." };
  }
  const reminderText = message?.trim() || "Time for your daily reading session! Open your book and log your pages.";

  const newReminder = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    familyId: familyId || '',
    parentProfileId: parentProfileId || '',
    childId,
    childName: childName || 'Reader',
    message: reminderText,
    scheduledTime: scheduledTime || 'Today',
    acknowledged: false,
    createdAt: new Date().toISOString()
  };

  try {
    const raw = await AsyncStorage.getItem(CHILD_REMINDERS_KEY);
    const all = raw ? JSON.parse(raw) : [];
    const updated = [newReminder, ...all].slice(0, 50);
    await AsyncStorage.setItem(CHILD_REMINDERS_KEY, JSON.stringify(updated));
    return { success: true, reminder: newReminder };
  } catch (error) {
    console.error("Failed to save child reading reminder:", error);
    return { success: false, error: error.message };
  }
}

export async function getChildReadingReminders(childId, parentProfileId = null) {
  try {
    const raw = await AsyncStorage.getItem(CHILD_REMINDERS_KEY);
    const all = raw ? JSON.parse(raw) : [];
    const childReminders = all.filter((r) => r.childId === childId && !r.acknowledged);

    if (childReminders.length === 0 && parentProfileId) {
      const settings = await getParentSettings(parentProfileId);
      if (settings?.childRemindersEnabled) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const dailyId = `daily_${parentProfileId}_${childId}_${todayStr}`;
        const alreadyAckedToday = all.some((r) => r.id === dailyId && r.acknowledged);
        if (!alreadyAckedToday) {
          return [
            {
              id: dailyId,
              isDailySchedule: true,
              parentProfileId,
              childId,
              message: settings.defaultReminderMessage || "Don't forget your daily reading goal!",
              scheduledTime: `Daily at ${settings.dailyReminderTime || '4:30 PM'} (Goal: ${settings.dailyPageGoal || 15} pages)`,
              acknowledged: false,
              createdAt: new Date().toISOString()
            }
          ];
        }
      }
    }

    return childReminders;
  } catch (error) {
    console.error("Failed to get child reading reminders:", error);
    return [];
  }
}

export async function acknowledgeChildReminder(reminder, childName) {
  try {
    const raw = await AsyncStorage.getItem(CHILD_REMINDERS_KEY);
    const all = raw ? JSON.parse(raw) : [];
    if (reminder.isDailySchedule) {
      const filtered = all.filter((r) => r.id !== reminder.id);
      filtered.unshift({
        ...reminder,
        acknowledged: true,
        acknowledgedAt: new Date().toISOString()
      });
      await AsyncStorage.setItem(CHILD_REMINDERS_KEY, JSON.stringify(filtered.slice(0, 50)));
    } else {
      const updated = all.map((r) =>
        r.id === reminder.id ? { ...r, acknowledged: true, acknowledgedAt: new Date().toISOString() } : r
      );
      await AsyncStorage.setItem(CHILD_REMINDERS_KEY, JSON.stringify(updated));
    }

    if (reminder.parentProfileId || reminder.familyId) {
      await sendParentPushNotification(
        "⏰ Reading Reminder Acknowledged",
        `${childName || 'Your child'} saw the reading reminder ("${reminder.message}") and is ready to read!`,
        {
          familyId: reminder.familyId,
          parentProfileId: reminder.parentProfileId,
          childId: reminder.childId,
          eventType: 'REMINDER_ACKNOWLEDGED'
        }
      );
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to acknowledge reminder:", error);
    return { success: false };
  }
}

/**
 * Child Book Library Management (Used by Library Tab for both Child and Parent)
 */
export async function getChildLibrary(childId) {
  if (!childId) return [];
  try {
    const raw = await AsyncStorage.getItem(`${CHILD_LIBRARY_PREFIX}${childId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Failed to load child library:", error);
    return [];
  }
}

export async function upsertBookInChildLibrary(childId, {
  bookTitle,
  author,
  startingPage = 1,
  currentPage = 1,
  incrementQuizPass = false,
  addedBy = 'child'
}) {
  if (!childId || !bookTitle?.trim()) return [];
  try {
    const existing = await getChildLibrary(childId);
    const normalizedTitle = bookTitle.trim().toLowerCase();
    const idx = existing.findIndex((b) => b.bookTitle.toLowerCase() === normalizedTitle);

    const now = new Date().toISOString();
    if (idx >= 0) {
      const currentBook = existing[idx];
      existing[idx] = {
        ...currentBook,
        bookTitle: bookTitle.trim(),
        author: author?.trim() || currentBook.author,
        startingPage: Number(startingPage) || currentBook.startingPage || 1,
        currentPage: Math.max(Number(currentPage) || 1, Number(currentBook.currentPage) || 1),
        quizzesPassed: (currentBook.quizzesPassed || 0) + (incrementQuizPass ? 1 : 0),
        lastUpdatedAt: now
      };
    } else {
      existing.unshift({
        id: 'book_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        childId,
        bookTitle: bookTitle.trim(),
        author: author?.trim() || 'Unknown Author',
        startingPage: Number(startingPage) || 1,
        currentPage: Number(currentPage) || Number(startingPage) || 1,
        quizzesPassed: incrementQuizPass ? 1 : 0,
        addedBy,
        createdAt: now,
        lastUpdatedAt: now
      });
    }

    await AsyncStorage.setItem(`${CHILD_LIBRARY_PREFIX}${childId}`, JSON.stringify(existing));
    return existing;
  } catch (error) {
    console.error("Failed to upsert book in child library:", error);
    return [];
  }
}
