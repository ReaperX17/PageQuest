import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  RefreshControl
} from 'react-native';
import { cloudStorage as AsyncStorage } from '../config/firebaseConfig';
import { generateComprehensionQuiz } from '../services/quizService';
import { createReadingSession } from '../models/schemas';
import { getParentSettings } from '../services/authService';
import {
  handleChildStartedReading,
  handleChildUpdatedPage,
  handleChildStartedQuiz,
  getChildReadingReminders,
  acknowledgeChildReminder,
  getChildLibrary,
  upsertBookInChildLibrary,
  getChildRewards,
  selectNextActiveReward,
  requestRewardByChild,
  deleteChildRewardItem,
  computeChildReadingStats
} from '../services/notificationService';
import { COLORS, SHADOWS } from '../theme';

export async function saveChildLiveStatus(childId, liveData) {
  if (!childId) return;
  try {
    const raw = await AsyncStorage.getItem('@child_live_reading_status');
    const map = raw ? JSON.parse(raw) : {};
    map[childId] = {
      ...liveData,
      updatedAt: new Date().toISOString()
    };
    await AsyncStorage.setItem('@child_live_reading_status', JSON.stringify(map));
  } catch (e) {
    console.error("Failed to update live reading status:", e);
  }
}

function formatTimerLabel(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
}

export default function ChildReadingScreen({ childProfile, onStartReading, onQuizReady }) {
  // Maximum 3 Tabs for Child Profile: 'library', 'quizzes', 'history'
  const [activeTab, setActiveTab] = useState('library');
  const [bookTitle, setBookTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [startingPage, setStartingPage] = useState('');
  const [currentPage, setCurrentPage] = useState('');
  const [readingNote, setReadingNote] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [startedReadingTimestamp, setStartedReadingTimestamp] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Library, Reminders, History, Rewards List, and Daily Goal State
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [childHistory, setChildHistory] = useState([]);
  const [rewardsList, setRewardsList] = useState([]);
  const [showRequestRewardForm, setShowRequestRewardForm] = useState(false);
  const [requestRewardTitle, setRequestRewardTitle] = useState('');
  const [requestRewardTarget, setRequestRewardTarget] = useState('5');
  const [dailyPageGoal, setDailyPageGoal] = useState(15);
  const [expandedQuizId, setExpandedQuizId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const childId = childProfile?.id || 'default';
  const sessionStorageKey = `@last_reading_session_${childId}`;

  const loadChildData = useCallback(async () => {
    try {
      const [savedSession, books, activeReminders, rawHistory, loadedRewards, loadedSettings] =
        await Promise.all([
          AsyncStorage.getItem(sessionStorageKey),
          getChildLibrary(childId),
          getChildReadingReminders(childId, childProfile?.parentProfileId),
          AsyncStorage.getItem('@reading_sessions_history'),
          getChildRewards(childId),
          getParentSettings(childProfile?.parentProfileId)
        ]);

      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        setBookTitle(parsed.bookTitle || '');
        setAuthor(parsed.author || '');
        setReadingNote(parsed.readingNote || '');
        const nextStartPage = parsed.nextStartingPage ?? parsed.startingPage;
        setStartingPage(nextStartPage ? String(nextStartPage) : '');
        setCurrentPage(
          parsed.currentPage ? String(parsed.currentPage) : nextStartPage ? String(nextStartPage) : ''
        );
        if (parsed.isReading && parsed.bookTitle && parsed.author && nextStartPage) {
          setIsReading(true);
          const ts = parsed.startedReadingTimestamp || Date.now();
          setStartedReadingTimestamp(ts);
          setElapsedSeconds(Math.max(0, Math.floor((Date.now() - ts) / 1000)));
        } else {
          setIsReading(false);
          setStartedReadingTimestamp(null);
          setElapsedSeconds(0);
        }
      }

      setLibraryBooks(books || []);
      setReminders(activeReminders || []);
      setRewardsList(loadedRewards || []);
      if (loadedSettings?.dailyPageGoal) {
        setDailyPageGoal(Number(loadedSettings.dailyPageGoal) || 15);
      }

      const parsedHistory = rawHistory ? JSON.parse(rawHistory) : [];
      const mySessions = parsedHistory.filter((s) => s.childId === childId);
      setChildHistory(mySessions);
    } catch (e) {
      console.error("Failed to load child screen data", e);
    } finally {
      setRefreshing(false);
    }
  }, [childId, childProfile?.parentProfileId, sessionStorageKey]);

  useEffect(() => {
    loadChildData();
  }, [loadChildData]);

  // Live reading timer interval while reading is active
  useEffect(() => {
    if (!isReading) return;
    const startTs = startedReadingTimestamp || Date.now();
    if (!startedReadingTimestamp) {
      setStartedReadingTimestamp(startTs);
    }
    const timer = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTs) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [isReading, startedReadingTimestamp]);

  const handleAcknowledgeReminder = async (reminder) => {
    await acknowledgeChildReminder(reminder, childProfile?.name);
    setReminders((prev) => prev.filter((r) => r.id !== reminder.id));
    setStatusMessage("Awesome! Your parent has been notified that you started your reading time.");
  };

  const handleRequestReward = async () => {
    setStatusMessage('');
    setErrorMessage('');
    if (!requestRewardTitle.trim()) {
      const msg = "Please enter what reward you would like to request!";
      setErrorMessage(msg);
      Alert.alert("Missing Reward Idea", msg);
      return;
    }

    const res = await requestRewardByChild({
      childId,
      childName: childProfile?.name,
      parentProfileId: childProfile?.parentProfileId,
      familyId: childProfile?.familyId,
      title: requestRewardTitle.trim(),
      suggestedTargetQuizzes: parseInt(requestRewardTarget, 10) || 5
    });

    if (res.success) {
      setRewardsList(res.rewards);
      setRequestRewardTitle('');
      setRequestRewardTarget('5');
      setShowRequestRewardForm(false);
      const msg = `Sent reward request "${res.request.title}" to your parent for approval!`;
      setStatusMessage(msg);
      Alert.alert("Request Sent! 🎁", msg);
    } else {
      setErrorMessage(res.error || "Failed to send reward request.");
    }
  };

  const handleRemoveOwnRewardRequest = async (rewardId) => {
    const res = await deleteChildRewardItem(childId, rewardId);
    if (res.success) {
      setRewardsList(res.rewards);
    }
  };

  const handleSelectBookFromLibrary = async (book) => {
    setStatusMessage('');
    setErrorMessage('');
    const nextPg = book.currentPage || book.startingPage || 1;
    const nowTs = Date.now();
    setBookTitle(book.bookTitle);
    setAuthor(book.author);
    setStartingPage(String(nextPg));
    setCurrentPage(String(nextPg));
    setReadingNote('');
    setStartedReadingTimestamp(nowTs);
    setElapsedSeconds(0);

    const stateToSave = {
      bookTitle: book.bookTitle,
      author: book.author,
      startingPage: nextPg,
      currentPage: nextPg,
      nextStartingPage: nextPg,
      readingNote: '',
      startedReadingTimestamp: nowTs,
      isReading: true
    };
    await AsyncStorage.setItem(sessionStorageKey, JSON.stringify(stateToSave));
    await saveChildLiveStatus(childId, {
      childId,
      childName: childProfile?.name,
      parentProfileId: childProfile?.parentProfileId,
      familyId: childProfile?.familyId,
      bookTitle: book.bookTitle,
      author: book.author,
      startingPage: nextPg,
      currentPage: nextPg,
      status: 'Reading in progress'
    });
    setIsReading(true);
    setStatusMessage(`Loaded "${book.bookTitle}" at page ${nextPg}!`);
  };

  const handleStartOrUpdateBook = async () => {
    setStatusMessage('');
    setErrorMessage('');
    const parsedStart = parseInt(startingPage, 10);
    if (!bookTitle.trim() || !author.trim() || isNaN(parsedStart) || parsedStart <= 0) {
      const msg = "Please enter a valid Book Title, Author, and numeric Starting Page (1 or higher).";
      setErrorMessage(msg);
      Alert.alert("Missing Information", msg);
      return;
    }

    const nowTs = Date.now();
    const sessionData = createReadingSession({
      parentProfileId: childProfile?.parentProfileId,
      familyId: childProfile?.familyId,
      childId,
      childName: childProfile?.name || childProfile?.displayName,
      childAge: childProfile?.age || 8,
      bookTitle: bookTitle.trim(),
      author: author.trim(),
      startingPage: parsedStart,
      currentPage: parsedStart,
      status: 'started_reading'
    });

    try {
      const stateToSave = {
        bookTitle: bookTitle.trim(),
        author: author.trim(),
        startingPage: parsedStart,
        currentPage: parsedStart,
        nextStartingPage: parsedStart,
        readingNote: '',
        startedReadingTimestamp: nowTs,
        isReading: true
      };
      await AsyncStorage.setItem(sessionStorageKey, JSON.stringify(stateToSave));
      await saveChildLiveStatus(childId, {
        childId,
        childName: childProfile?.name,
        parentProfileId: childProfile?.parentProfileId,
        familyId: childProfile?.familyId,
        bookTitle: bookTitle.trim(),
        author: author.trim(),
        startingPage: parsedStart,
        currentPage: parsedStart,
        status: 'Reading in progress'
      });
      const updatedBooks = await upsertBookInChildLibrary(childId, {
        bookTitle: bookTitle.trim(),
        author: author.trim(),
        startingPage: parsedStart,
        currentPage: parsedStart,
        addedBy: 'child'
      });
      setLibraryBooks(updatedBooks);
      await handleChildStartedReading(sessionData);
    } catch (e) {
      console.error("Failed to save session", e);
    }

    setCurrentPage(String(parsedStart));
    setReadingNote('');
    setStartedReadingTimestamp(nowTs);
    setElapsedSeconds(0);
    setActiveSession(sessionData);
    setIsReading(true);
    if (onStartReading) {
      onStartReading(sessionData);
    }
  };

  const handleUpdateCurrentPage = async () => {
    setStatusMessage('');
    setErrorMessage('');
    const parsedStart = parseInt(startingPage, 10);
    const parsedCurrent = parseInt(currentPage, 10);

    if (isNaN(parsedCurrent) || parsedCurrent < parsedStart) {
      const msg = `Please enter a page number greater than or equal to your starting page (${parsedStart}).`;
      setErrorMessage(msg);
      Alert.alert("Invalid Page Number", msg);
      return;
    }

    const updatedSession = {
      ...(activeSession || {}),
      parentProfileId: childProfile?.parentProfileId,
      familyId: childProfile?.familyId,
      childId,
      childName: childProfile?.name || childProfile?.displayName,
      childAge: childProfile?.age || 8,
      bookTitle: bookTitle.trim(),
      author: author.trim(),
      startingPage: parsedStart,
      currentPage: parsedCurrent,
      readingNote: readingNote.trim()
    };

    try {
      await AsyncStorage.setItem(sessionStorageKey, JSON.stringify({
        bookTitle: bookTitle.trim(),
        author: author.trim(),
        startingPage: parsedStart,
        currentPage: parsedCurrent,
        nextStartingPage: parsedStart,
        readingNote: readingNote.trim(),
        startedReadingTimestamp: startedReadingTimestamp || Date.now(),
        isReading: true
      }));
      await saveChildLiveStatus(childId, {
        childId,
        childName: childProfile?.name,
        parentProfileId: childProfile?.parentProfileId,
        familyId: childProfile?.familyId,
        bookTitle: bookTitle.trim(),
        author: author.trim(),
        startingPage: parsedStart,
        currentPage: parsedCurrent,
        status: 'Reading in progress'
      });
      const updatedBooks = await upsertBookInChildLibrary(childId, {
        bookTitle: bookTitle.trim(),
        author: author.trim(),
        startingPage: parsedStart,
        currentPage: parsedCurrent
      });
      setLibraryBooks(updatedBooks);
      await handleChildUpdatedPage(updatedSession);
      setActiveSession(updatedSession);
      setStatusMessage(`Saved! Your current page is now page ${parsedCurrent}.`);
    } catch (e) {
      console.error("Failed to update current page:", e);
    }
  };

  const handleActivateQuiz = async () => {
    setStatusMessage('');
    setErrorMessage('');
    if (!currentPage) {
      const msg = "Please enter the page number you reached to activate your quiz.";
      setErrorMessage(msg);
      Alert.alert("Page Required", msg);
      return;
    }

    const parsedEndingPage = parseInt(currentPage, 10);
    const parsedStartingPage = parseInt(startingPage, 10);

    if (isNaN(parsedEndingPage) || parsedEndingPage < parsedStartingPage) {
      const msg = `Your current/ending page must be a valid number greater than or equal to your starting page (${parsedStartingPage}).`;
      setErrorMessage(msg);
      Alert.alert("Invalid Page Range", msg);
      return;
    }

    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    setIsLoadingQuiz(true);

    try {
      const quizData = await generateComprehensionQuiz({
        childAge: childProfile?.age || 8,
        bookTitle: bookTitle.trim(),
        author: author.trim(),
        startingPage: parsedStartingPage,
        endingPage: parsedEndingPage
      });

      const updatedSession = {
        ...(activeSession || {}),
        parentProfileId: childProfile?.parentProfileId,
        familyId: childProfile?.familyId,
        childId,
        childName: childProfile?.name || childProfile?.displayName,
        childAge: childProfile?.age || 8,
        bookTitle: bookTitle.trim(),
        author: author.trim(),
        startingPage: parsedStartingPage,
        currentPage: parsedEndingPage,
        endingPage: parsedEndingPage,
        durationMinutes,
        readingNote: readingNote.trim(),
        status: 'quiz_started',
        quizStartedAt: new Date().toISOString()
      };

      await saveChildLiveStatus(childId, {
        childId,
        childName: childProfile?.name,
        parentProfileId: childProfile?.parentProfileId,
        familyId: childProfile?.familyId,
        bookTitle: bookTitle.trim(),
        author: author.trim(),
        startingPage: parsedStartingPage,
        currentPage: parsedEndingPage,
        status: 'Taking comprehension quiz'
      });
      await handleChildStartedQuiz(updatedSession);

      setIsLoadingQuiz(false);

      if (onQuizReady) {
        onQuizReady({
          ...updatedSession,
          quizData
        });
      }
    } catch (error) {
      setIsLoadingQuiz(false);
      const msg = error.message || "Failed to generate quiz. Please try again.";
      setErrorMessage(msg);
      Alert.alert("Error", msg);
      console.error("Error in handleActivateQuiz:", error);
    }
  };

  // Computed stats for Streak, Daily Page Goal, Rewards, and Quiz Results
  const todayStr = new Date().toISOString().slice(0, 10);
  const startPgNum = parseInt(startingPage, 10) || 0;
  const currPgNum = parseInt(currentPage, 10) || 0;
  const alreadyLoggedActiveRangeToday = childHistory.some(
    (s) =>
      (s.completedAt || '').slice(0, 10) === todayStr &&
      (s.bookTitle || '').toLowerCase() === bookTitle.trim().toLowerCase() &&
      Number(s.startingPage) === startPgNum &&
      Number(s.endingPage) === currPgNum
  );
  const inProgressPagesToday =
    isReading && !alreadyLoggedActiveRangeToday ? Math.max(0, currPgNum - startPgNum) : 0;

  const readingStats = computeChildReadingStats(childHistory, dailyPageGoal, inProgressPagesToday);
  const passedQuizzesCount = childHistory.filter((s) => s.quizResult?.passed).length;
  const averageQuizScore = childHistory.length > 0
    ? Math.round(
        childHistory.reduce((acc, s) => acc + (s.quizResult?.scorePercentage || 0), 0) /
          childHistory.length
      )
    : 0;

  const rewardGoal = selectNextActiveReward(rewardsList, passedQuizzesCount);

  const targetRewardQuizzes = Math.max(1, Number(rewardGoal?.targetQuizzes) || 5);
  const rewardProgressPercent = Math.min(
    100,
    Math.round((passedQuizzesCount / targetRewardQuizzes) * 100)
  );

  return (
    <View style={styles.screenContainer}>
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadChildData();
              }}
            />
          }
        >
          {/* Child Welcome Hero with Streak & Books */}
          <View style={styles.childHero}>
            <View style={styles.flexOne}>
              <Text style={styles.childHeroGreeting}>
                Hi, {childProfile?.name || 'Reader'}! 🌟
              </Text>
              <Text style={styles.childHeroSub}>
                Reader Level: Age {childProfile?.age || 8} • {passedQuizzesCount} Quizzes Passed
              </Text>
            </View>
            <View style={styles.heroBadgesCol}>
              <View style={styles.streakBadge}>
                <Text style={styles.streakBadgeText}>
                  🔥 {readingStats.streakDays}-Day Streak
                </Text>
              </View>
              <View style={styles.booksCountPill}>
                <Text style={styles.booksCountText}>📚 {libraryBooks.length} Books</Text>
              </View>
            </View>
          </View>

          {/* Daily Page Goal & Family Reward Progress Strip */}
          <View style={styles.goalsRowCard}>
            <View style={styles.goalHalfBox}>
              <View style={styles.goalHeaderRow}>
                <Text style={styles.goalLabel}>🎯 Today's Page Goal</Text>
                <Text style={styles.goalCountText}>
                  {readingStats.pagesReadToday}/{readingStats.dailyPageGoal} pgs
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${readingStats.dailyGoalPercent}%`,
                      backgroundColor:
                        readingStats.dailyGoalPercent >= 100 ? COLORS.success : COLORS.primary
                    }
                  ]}
                />
              </View>
            </View>

            <View style={styles.goalDivider} />

            <View style={styles.goalHalfBox}>
              <View style={styles.goalHeaderRow}>
                <Text style={styles.goalLabel} numberOfLines={1}>
                  🎁 {rewardGoal?.title || 'Family Reward'}
                </Text>
                <Text style={styles.goalCountText}>
                  {passedQuizzesCount}/{targetRewardQuizzes}
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${rewardProgressPercent}%`,
                      backgroundColor: COLORS.warning
                    }
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Reading Reminders Banner (Sent or Scheduled by Parent) */}
          {reminders.map((rem) => (
            <View key={rem.id} style={styles.reminderCard}>
              <View style={styles.reminderHeaderRow}>
                <Text style={styles.reminderBadge}>⏰ READING REMINDER</Text>
                <Text style={styles.reminderTime}>{rem.scheduledTime}</Text>
              </View>
              <Text style={styles.reminderMessage}>{rem.message}</Text>
              <TouchableOpacity
                style={styles.reminderAckBtn}
                onPress={() => handleAcknowledgeReminder(rem)}
                activeOpacity={0.85}
              >
                <Text style={styles.reminderAckText}>✓ Got It! Start Reading Now</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* TAB 1: LIBRARY (Active Book & Page Tracker + Book Shelf) */}
          {activeTab === 'library' && (
            <View>
              {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}
              {statusMessage ? <Text style={styles.statusBanner}>{statusMessage}</Text> : null}

              {isLoadingQuiz ? (
                <View style={styles.loadingCard}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={styles.loadingTitle}>Building Your 10-Question Quiz...</Text>
                  <Text style={styles.loadingSub}>
                    Tailoring questions for "{bookTitle}" (Pages {startingPage}–{currentPage})
                  </Text>
                </View>
              ) : !isReading ? (
                <View style={styles.card}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.cardTitle}>📖 Start or Update Current Book</Text>
                  </View>
                  <Text style={styles.cardSubtext}>
                    Enter the book you are reading and your starting page, or pick a book from your shelf below.
                  </Text>

                  <Text style={styles.label}>Book Title *</Text>
                  <TextInput
                    placeholder="e.g., Charlotte's Web"
                    placeholderTextColor={COLORS.textMuted}
                    value={bookTitle}
                    onChangeText={setBookTitle}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Author *</Text>
                  <TextInput
                    placeholder="e.g., E.B. White"
                    placeholderTextColor={COLORS.textMuted}
                    value={author}
                    onChangeText={setAuthor}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Starting Page *</Text>
                  <TextInput
                    placeholder="Page number you are starting on"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                    value={startingPage}
                    onChangeText={setStartingPage}
                    returnKeyType="done"
                    style={styles.input}
                  />

                  <TouchableOpacity
                    style={[styles.primaryButton, styles.indigoButton]}
                    onPress={handleStartOrUpdateBook}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>Save Book & Start Reading →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.card, styles.activeReadingCard]}>
                  <View style={styles.activeHeaderRow}>
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>CURRENTLY READING</Text>
                    </View>
                    <View style={styles.timerPill}>
                      <Text style={styles.timerPillText}>
                        ⏱️ {formatTimerLabel(elapsedSeconds)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.activeBookTitle}>{bookTitle}</Text>
                  <Text style={styles.activeBookAuthor}>by {author}</Text>

                  <View style={styles.pageStatsRow}>
                    <View style={styles.pageStatBox}>
                      <Text style={styles.pageStatLabel}>Started At</Text>
                      <Text style={styles.pageStatValue}>Page {startingPage}</Text>
                    </View>
                    <View style={styles.pageStatBox}>
                      <Text style={styles.pageStatLabel}>Current Page</Text>
                      <Text style={[styles.pageStatValue, { color: COLORS.primary }]}>
                        Page {currentPage || startingPage}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.label}>Update What Page You Are On *</Text>
                  <TextInput
                    placeholder="Enter your current / ending page"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                    value={currentPage}
                    onChangeText={setCurrentPage}
                    returnKeyType="done"
                    style={styles.input}
                  />

                  <Text style={styles.label}>
                    ✨ New Word or Favorite Moment from These Pages (Optional)
                  </Text>
                  <TextInput
                    placeholder="e.g., Learned the word 'radiant' when Charlotte spun her web!"
                    placeholderTextColor={COLORS.textMuted}
                    value={readingNote}
                    onChangeText={setReadingNote}
                    style={styles.input}
                  />

                  <TouchableOpacity
                    style={[styles.primaryButton, styles.skyButton, styles.buttonSpacing]}
                    onPress={handleUpdateCurrentPage}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>🔖 Save Current Page Progress</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryButton, styles.greenButton, styles.buttonSpacing]}
                    onPress={handleActivateQuiz}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>🎯 Activate & Take 10-Question Quiz</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                      setStatusMessage('');
                      setErrorMessage('');
                      setIsReading(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.secondaryButtonText}>Switch Book / Change Starting Page</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Child's Book Library Shelf */}
              <Text style={styles.sectionTitle}>📚 My Book Library ({libraryBooks.length})</Text>
              {libraryBooks.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyIcon}>📘</Text>
                  <Text style={styles.emptyTitle}>Your Library Shelf is Empty</Text>
                  <Text style={styles.emptyText}>
                    Start reading a book above and it will automatically be saved to your personal library!
                  </Text>
                </View>
              ) : (
                libraryBooks.map((book) => (
                  <View key={book.id} style={styles.bookItemCard}>
                    <View style={styles.bookIconBox}>
                      <Text style={styles.bookIconEmoji}>📕</Text>
                    </View>
                    <View style={styles.flexOne}>
                      <View style={styles.bookTitleRow}>
                        <Text style={styles.bookItemTitle}>{book.bookTitle}</Text>
                        {book.addedBy === 'parent' && (
                          <View style={styles.parentPickBadge}>
                            <Text style={styles.parentPickText}>Parent Pick</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.bookItemAuthor}>by {book.author}</Text>
                      <Text style={styles.bookItemMeta}>
                        Current Bookmark: Page {book.currentPage || book.startingPage || 1} • 🏆 {book.quizzesPassed || 0} Quizzes Passed
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.resumeBookBtn}
                      onPress={() => handleSelectBookFromLibrary(book)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.resumeBookBtnText}>Read</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 2: QUIZ RESULTS & REWARD MILESTONES */}
          {activeTab === 'quizzes' && (
            <View>
              {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}
              {statusMessage ? <Text style={styles.statusBanner}>{statusMessage}</Text> : null}

              {/* Multi-Reward Milestones & Child Reward Request Section */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>🎁 My Rewards & Milestones</Text>
                <TouchableOpacity
                  style={styles.requestRewardBtn}
                  onPress={() => setShowRequestRewardForm(!showRequestRewardForm)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.requestRewardBtnText}>
                    {showRequestRewardForm ? 'Close' : '+ Request a Reward'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showRequestRewardForm && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>✨ Ask Parent for a New Reward</Text>
                  <Text style={styles.cardSubtext}>
                    Have a fun reward idea? Send it to your parent so they can approve it and set your quiz milestone!
                  </Text>

                  <Text style={styles.label}>What reward would you like? *</Text>
                  <TextInput
                    placeholder="e.g., Trip to the Ice Cream Shop 🍦 or New Book!"
                    placeholderTextColor={COLORS.textMuted}
                    value={requestRewardTitle}
                    onChangeText={setRequestRewardTitle}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Suggested Quizzes Passed to Unlock</Text>
                  <TextInput
                    placeholder="5"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                    value={requestRewardTarget}
                    onChangeText={setRequestRewardTarget}
                    style={styles.input}
                  />

                  <TouchableOpacity
                    style={[styles.primaryButton, styles.indigoButton]}
                    onPress={handleRequestReward}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>✨ Send Reward Request to Parent</Text>
                  </TouchableOpacity>
                </View>
              )}

              {rewardsList.map((item) => {
                const target = Math.max(1, Number(item.targetQuizzes) || 5);
                const pct = Math.min(100, Math.round((passedQuizzesCount / target) * 100));
                const isUnlocked = passedQuizzesCount >= target;

                if (item.status === 'requested') {
                  return (
                    <View key={item.id} style={styles.pendingRewardCard}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.pendingRewardBadge}>⏳ WAITING FOR PARENT APPROVAL</Text>
                        <TouchableOpacity onPress={() => handleRemoveOwnRewardRequest(item.id)}>
                          <Text style={styles.pendingRewardGoal}>Cancel Request</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.rewardPrizeName}>{item.title}</Text>
                      <Text style={styles.pendingRewardSub}>
                        Suggested Goal: {target} Quizzes • Waiting for parent to approve in their Profiles tab.
                      </Text>
                    </View>
                  );
                }

                if (item.status === 'denied') {
                  return (
                    <View key={item.id} style={styles.deniedRewardCard}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.deniedRewardBadge}>DECLINED BY PARENT</Text>
                        <TouchableOpacity onPress={() => handleRemoveOwnRewardRequest(item.id)}>
                          <Text style={styles.deniedRewardGoal}>Dismiss ✕</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.deniedRewardTitle}>{item.title}</Text>
                    </View>
                  );
                }

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.rewardCard,
                      item.claimed && styles.claimedRewardCard,
                      isUnlocked && !item.claimed && styles.unlockedRewardCard
                    ]}
                  >
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.rewardCardTitle}>
                        {item.claimed
                          ? '✓ REWARD CLAIMED!'
                          : isUnlocked
                          ? '🎉 UNLOCKED! READY TO CLAIM'
                          : `🎁 MILESTONE (${target} QUIZZES)`}
                      </Text>
                      <Text style={styles.rewardBadgeText}>
                        {passedQuizzesCount} / {target} Passed
                      </Text>
                    </View>
                    <Text style={styles.rewardPrizeName}>{item.title}</Text>
                    {item.requestedBy === 'child' && (
                      <Text style={styles.approvedRequestTag}>
                        ✨ Requested by you & approved by parent!
                      </Text>
                    )}
                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: item.claimed || isUnlocked ? COLORS.success : COLORS.warning
                          }
                        ]}
                      />
                    </View>
                    <Text style={styles.rewardSubtext}>
                      {item.claimed
                        ? 'You earned and claimed this reward! Great reading!'
                        : isUnlocked
                        ? '🎉 Goal Unlocked! Show your parent to claim your reward!'
                        : `Pass ${Math.max(0, target - passedQuizzesCount)} more quiz${
                            target - passedQuizzesCount === 1 ? '' : 'zes'
                          } with 90%+ to unlock!`}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{childHistory.length}</Text>
                  <Text style={styles.statLabel}>Quizzes Taken</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statNumber, { color: COLORS.success }]}>{passedQuizzesCount}</Text>
                  <Text style={styles.statLabel}>Passed (90%+)</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statNumber, { color: COLORS.primary }]}>{averageQuizScore}%</Text>
                  <Text style={styles.statLabel}>Avg Score</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>🏆 My Quiz Results</Text>
              {childHistory.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyIcon}>🏆</Text>
                  <Text style={styles.emptyTitle}>No Quiz Results Yet</Text>
                  <Text style={styles.emptyText}>
                    Finish reading your pages in the Library tab and activate a quiz to see your scores here!
                  </Text>
                </View>
              ) : (
                childHistory.map((session, idx) => {
                  const res = session.quizResult;
                  const idKey = session.sessionId || String(idx);
                  const isExpanded = expandedQuizId === idKey;
                  return (
                    <View key={idKey} style={styles.card}>
                      <View style={styles.quizResultHeaderRow}>
                        <View style={styles.flexOne}>
                          <Text style={styles.quizBookTitle}>{session.bookTitle}</Text>
                          <Text style={styles.quizBookSub}>
                            by {session.author} • Pages {session.startingPage}–{session.endingPage}
                          </Text>
                        </View>
                        {res && (
                          <View style={[styles.scoreBadge, res.passed ? styles.passBadgeBg : styles.failBadgeBg]}>
                            <Text style={[styles.scoreBadgeText, res.passed ? styles.passBadgeText : styles.failBadgeText]}>
                              {res.scorePercentage}% {res.passed ? 'PASSED' : 'RETRY'}
                            </Text>
                          </View>
                        )}
                      </View>

                      {res && (
                        <>
                          <Text style={styles.quizScoreLine}>
                            Correct Answers: {res.correctCount} out of {res.totalQuestions || 10}
                          </Text>
                          {Array.isArray(res.breakdown) && res.breakdown.length > 0 && (
                            <TouchableOpacity
                              style={styles.toggleBreakdownBtn}
                              onPress={() => setExpandedQuizId(isExpanded ? null : idKey)}
                            >
                              <Text style={styles.toggleBreakdownText}>
                                {isExpanded ? 'Hide Question Details ▲' : 'View Question Details ▼'}
                              </Text>
                            </TouchableOpacity>
                          )}

                          {isExpanded && Array.isArray(res.breakdown) && (
                            <View style={styles.breakdownContainer}>
                              {res.breakdown.map((q) => (
                                <View key={q.questionNumber} style={styles.breakdownRow}>
                                  <Text style={styles.breakdownQText}>
                                    {q.isCorrect ? '✓' : '✗'} Q{q.questionNumber}: {q.prompt}
                                  </Text>
                                  <Text style={styles.breakdownAText}>Your Answer: {q.selectedAnswer}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 3: READING HISTORY */}
          {activeTab === 'history' && (
            <View>
              <Text style={styles.sectionTitle}>🕒 Reading Session History</Text>
              {childHistory.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyIcon}>🕒</Text>
                  <Text style={styles.emptyTitle}>No Reading History Yet</Text>
                  <Text style={styles.emptyText}>
                    Every reading session and page range you complete will be logged in your timeline here.
                  </Text>
                </View>
              ) : (
                childHistory.map((item, idx) => {
                  const dateLabel = item.completedAt
                    ? new Date(item.completedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Completed';
                  const pagesCount = Math.max(1, (item.endingPage || item.startingPage) - item.startingPage + 1);
                  return (
                    <View key={item.sessionId || String(idx)} style={styles.historyCard}>
                      <View style={styles.historyTimelineDot} />
                      <View style={styles.flexOne}>
                        <View style={styles.historyTopRow}>
                          <Text style={styles.historyDate}>{dateLabel}</Text>
                          <Text style={styles.historyPagesPill}>
                            {pagesCount} Pages • ⏱️ {item.durationMinutes || 1}m
                          </Text>
                        </View>
                        <Text style={styles.historyBookTitle}>{item.bookTitle}</Text>
                        <Text style={styles.historyAuthor}>by {item.author}</Text>
                        <Text style={styles.historyRange}>
                          Read from Page {item.startingPage} to Page {item.endingPage}
                        </Text>
                        {item.readingNote ? (
                          <Text style={styles.historyNoteText}>
                            💬 Note: "{item.readingNote}"
                          </Text>
                        ) : null}
                        {item.quizResult && (
                          <Text
                            style={[
                              styles.historyQuizTag,
                              { color: item.quizResult.passed ? COLORS.successDark : COLORS.dangerDark }
                            ]}
                          >
                            Quiz Score: {item.quizResult.scorePercentage}% ({item.quizResult.passed ? 'Passed' : 'Needs Review'})
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Tab Bar (Strictly 3 Tabs Maximum for Child Mode) */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'library' && styles.activeTabButton]}
          onPress={() => setActiveTab('library')}
          activeOpacity={0.8}
        >
          <Text style={styles.tabIcon}>📚</Text>
          <Text style={[styles.tabLabel, activeTab === 'library' && styles.activeTabLabel]}>Library</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'quizzes' && styles.activeTabButton]}
          onPress={() => setActiveTab('quizzes')}
          activeOpacity={0.8}
        >
          <Text style={styles.tabIcon}>🏆</Text>
          <Text style={[styles.tabLabel, activeTab === 'quizzes' && styles.activeTabLabel]}>Quiz Results</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'history' && styles.activeTabButton]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.8}
        >
          <Text style={styles.tabIcon}>🕒</Text>
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.activeTabLabel]}>History</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: COLORS.background },
  flexOne: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32 },
  childHero: {
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    ...SHADOWS.card
  },
  childHeroGreeting: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  childHeroSub: { fontSize: 13, color: '#E0E7FF', marginTop: 3, fontWeight: '600' },
  heroBadgesCol: { alignItems: 'flex-end', gap: 6 },
  streakBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999
  },
  streakBadgeText: { color: '#92400E', fontWeight: '800', fontSize: 12 },
  booksCountPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  booksCountText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  goalsRowCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card
  },
  goalHalfBox: { flex: 1 },
  goalDivider: { width: 1, height: 34, backgroundColor: COLORS.border },
  goalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 4 },
  goalLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, flex: 1 },
  goalCountText: { fontSize: 11, fontWeight: '800', color: COLORS.textPrimary },
  progressBarBg: {
    height: 8,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 999,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999
  },
  rewardCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...SHADOWS.card
  },
  unlockedRewardCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7'
  },
  claimedRewardCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    opacity: 0.9
  },
  rewardCardTitle: { fontSize: 12, fontWeight: '800', color: '#92400E', textTransform: 'uppercase' },
  rewardBadgeText: { fontSize: 12, fontWeight: '800', color: '#B45309' },
  rewardPrizeName: { fontSize: 17, fontWeight: '800', color: '#78350F', marginVertical: 6 },
  rewardSubtext: { fontSize: 12, fontWeight: '600', color: '#92400E', marginTop: 8 },
  approvedRequestTag: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginBottom: 6 },
  requestRewardBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10
  },
  requestRewardBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  pendingRewardCard: {
    backgroundColor: COLORS.primaryLight,
    borderColor: '#A5B4FC',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    ...SHADOWS.card
  },
  pendingRewardBadge: { fontSize: 11, fontWeight: '800', color: COLORS.primaryDark },
  pendingRewardGoal: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  pendingRewardSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  deniedRewardCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12
  },
  deniedRewardBadge: { fontSize: 11, fontWeight: '800', color: COLORS.dangerDark },
  deniedRewardGoal: { fontSize: 12, fontWeight: '700', color: COLORS.dangerDark },
  deniedRewardTitle: { fontSize: 15, fontWeight: '700', color: '#7F1D1D', marginTop: 4 },
  reminderCard: {
    backgroundColor: COLORS.warningLight,
    borderColor: '#FCD34D',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...SHADOWS.card
  },
  reminderHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  reminderBadge: { fontSize: 11, fontWeight: '800', color: COLORS.warningDark, letterSpacing: 0.6 },
  reminderTime: { fontSize: 12, fontWeight: '700', color: COLORS.warningDark },
  reminderMessage: { fontSize: 15, fontWeight: '700', color: '#78350F', marginBottom: 12, lineHeight: 21 },
  reminderAckBtn: {
    backgroundColor: COLORS.warning,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center'
  },
  reminderAckText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card
  },
  activeReadingCard: {
    borderColor: '#A5B4FC',
    borderWidth: 1.5
  },
  activeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  activePill: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  activePillText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  timerPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#A7F3D0'
  },
  timerPillText: { fontSize: 12, fontWeight: '800', color: COLORS.successDark },
  activeBookTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  activeBookAuthor: { fontSize: 15, color: COLORS.textSecondary, marginBottom: 14 },
  pageStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  pageStatBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center'
  },
  pageStatLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  pageStatValue: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary },
  cardSubtext: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 14, lineHeight: 19 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 12, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    color: COLORS.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    borderRadius: 10,
    fontSize: 15
  },
  primaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  indigoButton: { backgroundColor: COLORS.primary },
  skyButton: { backgroundColor: COLORS.secondary },
  greenButton: { backgroundColor: COLORS.success },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center'
  },
  secondaryButtonText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  buttonSpacing: { marginBottom: 10 },
  statusBanner: {
    backgroundColor: COLORS.successLight,
    color: COLORS.successDark,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '700'
  },
  errorBanner: {
    backgroundColor: COLORS.dangerLight,
    color: COLORS.dangerDark,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '700'
  },
  loadingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    marginBottom: 18,
    ...SHADOWS.card
  },
  loadingTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginTop: 14 },
  loadingSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16
  },
  emptyIcon: { fontSize: 34, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19 },
  bookItemCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...SHADOWS.card
  },
  bookIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  bookIconEmoji: { fontSize: 22 },
  bookTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  bookItemTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  parentPickBadge: {
    backgroundColor: COLORS.secondaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999
  },
  parentPickText: { fontSize: 10, fontWeight: '800', color: '#0369A1' },
  bookItemAuthor: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  bookItemMeta: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  resumeBookBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10
  },
  resumeBookBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card
  },
  statNumber: { fontSize: 22, fontWeight: '900', color: COLORS.textPrimary },
  statLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, marginTop: 2 },
  quizResultHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  quizBookTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  quizBookSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  scoreBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  passBadgeBg: { backgroundColor: COLORS.successLight },
  failBadgeBg: { backgroundColor: COLORS.dangerLight },
  scoreBadgeText: { fontSize: 12, fontWeight: '800' },
  passBadgeText: { color: COLORS.successDark },
  failBadgeText: { color: COLORS.dangerDark },
  quizScoreLine: { fontSize: 13, color: COLORS.textSecondary, marginTop: 8, fontWeight: '600' },
  toggleBreakdownBtn: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  toggleBreakdownText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  breakdownContainer: { marginTop: 10, backgroundColor: COLORS.surfaceAlt, padding: 10, borderRadius: 10 },
  breakdownRow: { marginBottom: 8 },
  breakdownQText: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  breakdownAText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  historyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    gap: 12,
    ...SHADOWS.card
  },
  historyTimelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    marginTop: 4
  },
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  historyDate: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  historyPagesPill: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999
  },
  historyBookTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  historyAuthor: { fontSize: 13, color: COLORS.textSecondary },
  historyRange: { fontSize: 13, color: COLORS.textPrimary, marginTop: 4, fontWeight: '600' },
  historyNoteText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: COLORS.primaryDark,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6
  },
  historyQuizTag: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 12
  },
  activeTabButton: {
    backgroundColor: COLORS.primaryLight
  },
  tabIcon: { fontSize: 18, marginBottom: 2 },
  tabLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  activeTabLabel: { color: COLORS.primary, fontWeight: '800' }
});
