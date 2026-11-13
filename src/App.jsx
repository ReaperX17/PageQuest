import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthScreen from './screens/AuthScreen';
import ChildReadingScreen, { saveChildLiveStatus } from './screens/ChildReadingScreen';
import ChildQuizScreen from './screens/ChildQuizScreen';
import ParentDashboardScreen from './screens/ParentDashboardScreen';
import { createReadingSession } from './models/schemas';
import {
  handleChildCompletedQuiz,
  upsertBookInChildLibrary
} from './services/notificationService';
import {
  getPersistedChildSession,
  verifyAndClaimChildInvite
} from './services/authService';
import { COLORS } from './theme';

function extractInviteCodeFromUrl(url) {
  if (!url) return null;
  const match = String(url).match(/[?&](?:inviteCode|code)=([A-Za-z0-9]{6})/i);
  return match ? match[1].toUpperCase() : null;
}

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [role, setRole] = useState(null); // null, 'parent', or 'child'
  const [authInitialMode, setAuthInitialMode] = useState('select');
  const [parentProfile, setParentProfile] = useState(null);
  const [childProfile, setChildProfile] = useState(null);
  const [persistedChild, setPersistedChild] = useState(null);
  const [activeQuizData, setActiveQuizData] = useState(null);
  const [currentSessionInfo, setCurrentSessionInfo] = useState(null);

  // Restore permanent child session OR claim a texted ?inviteCode=XXXXXX profile access link on startup
  useEffect(() => {
    async function restoreOrClaimChildAccess() {
      try {
        // 1. Check if opened from an SMS invite access link (?inviteCode=XXXXXX)
        let initialUrl = null;
        if (typeof window !== 'undefined' && window.location?.href) {
          initialUrl = window.location.href;
        } else {
          initialUrl = await Linking.getInitialURL();
        }

        const urlInviteCode = extractInviteCodeFromUrl(initialUrl);
        if (urlInviteCode) {
          const claimResult = await verifyAndClaimChildInvite(urlInviteCode);
          if (claimResult.success && claimResult.child) {
            setPersistedChild(claimResult.child);
            setChildProfile(claimResult.child);
            setRole('child');
            setInitializing(false);
            return;
          }
        }

        // 2. Otherwise restore existing permanent child login
        const savedChild = await getPersistedChildSession();
        if (savedChild) {
          setPersistedChild(savedChild);
          setChildProfile(savedChild);
          setRole('child');
        }
      } catch (e) {
        console.error("Failed to restore permanent child login:", e);
      } finally {
        setInitializing(false);
      }
    }
    restoreOrClaimChildAccess();
  }, []);

  const handleLoginSuccess = (authenticatedRole, profileData) => {
    setRole(authenticatedRole);
    if (authenticatedRole === 'parent') {
      setParentProfile(profileData);
    } else if (authenticatedRole === 'child') {
      setChildProfile(profileData);
      setPersistedChild(profileData);
      setParentProfile(null);
    }
  };

  const handleQuizReady = (payload) => {
    setActiveQuizData(payload.quizData);
    setCurrentSessionInfo({
      sessionId: payload.sessionId,
      parentProfileId: payload.parentProfileId || childProfile?.parentProfileId,
      familyId: payload.familyId || childProfile?.familyId,
      childId: payload.childId || childProfile?.id,
      childName: payload.childName || childProfile?.name,
      childAge: payload.childAge || childProfile?.age,
      bookTitle: payload.bookTitle,
      author: payload.author,
      startingPage: payload.startingPage,
      currentPage: payload.currentPage || payload.endingPage,
      endingPage: payload.endingPage,
      durationMinutes: payload.durationMinutes || 1,
      readingNote: payload.readingNote || '',
      startedReadingAt: payload.timestamps?.startedReadingAt || payload.startedReadingAt,
      quizStartedAt: payload.quizStartedAt
    });
  };

  const handleQuizCompleted = async (result) => {
    try {
      if (currentSessionInfo) {
        const completedAt = new Date().toISOString();
        const sessionRecord = createReadingSession({
          ...currentSessionInfo,
          status: 'completed',
          quizResult: result,
          completedAt
        });

        // Advance next starting page to endingPage only if the child passed (>= 90%)
        const nextStartingPage = result.passed
          ? currentSessionInfo.endingPage
          : currentSessionInfo.startingPage;

        const childSessionKey = `@last_reading_session_${currentSessionInfo.childId || 'default'}`;
        await AsyncStorage.setItem(childSessionKey, JSON.stringify({
          bookTitle: currentSessionInfo.bookTitle,
          author: currentSessionInfo.author,
          startingPage: nextStartingPage,
          currentPage: result.passed ? nextStartingPage : currentSessionInfo.endingPage,
          endingPage: currentSessionInfo.endingPage,
          nextStartingPage,
          readingNote: result.passed ? '' : currentSessionInfo.readingNote || '',
          startedReadingTimestamp: Date.now(),
          // Keep reading session open on failure so the child can immediately review & retake quiz
          isReading: !result.passed
        }));

        await upsertBookInChildLibrary(currentSessionInfo.childId, {
          bookTitle: currentSessionInfo.bookTitle,
          author: currentSessionInfo.author,
          startingPage: nextStartingPage,
          currentPage: currentSessionInfo.endingPage,
          incrementQuizPass: result.passed
        });

        await saveChildLiveStatus(currentSessionInfo.childId, {
          childId: currentSessionInfo.childId,
          childName: currentSessionInfo.childName,
          parentProfileId: currentSessionInfo.parentProfileId,
          familyId: currentSessionInfo.familyId,
          bookTitle: currentSessionInfo.bookTitle,
          author: currentSessionInfo.author,
          startingPage: nextStartingPage,
          currentPage: currentSessionInfo.endingPage,
          status: result.passed
            ? `Passed Quiz (${result.scorePercentage}%) - Ready for Page ${nextStartingPage}`
            : `Needs Review (${result.scorePercentage}%) - Re-read Pages ${currentSessionInfo.startingPage}-${currentSessionInfo.endingPage}`
        });

        // Fetch existing history and prepend new session
        const existingHistoryJSON = await AsyncStorage.getItem('@reading_sessions_history');
        const history = existingHistoryJSON ? JSON.parse(existingHistoryJSON) : [];
        history.unshift(sessionRecord);
        await AsyncStorage.setItem('@reading_sessions_history', JSON.stringify(history));

        await handleChildCompletedQuiz(sessionRecord, result);
      }
    } catch (e) {
      console.error("Failed to save reading history", e);
    }

    // Reset quiz states back to child reading screen
    setActiveQuizData(null);
    setCurrentSessionInfo(null);
  };

  const handleOpenParentLogin = () => {
    setActiveQuizData(null);
    setCurrentSessionInfo(null);
    setAuthInitialMode('parent_login');
    setRole(null);
  };

  const handleParentLogout = async () => {
    setParentProfile(null);
    setActiveQuizData(null);
    setCurrentSessionInfo(null);

    const latestChild = await getPersistedChildSession();
    if (latestChild) {
      setPersistedChild(latestChild);
      setChildProfile(latestChild);
      setRole('child');
    } else {
      setAuthInitialMode('select');
      setRole(null);
    }
  };

  const handleAccountDeleted = async (deletionResult) => {
    setParentProfile(null);
    setActiveQuizData(null);
    setCurrentSessionInfo(null);

    if (deletionResult?.clearedDeviceChildSession || deletionResult?.deletedEntireFamily) {
      setPersistedChild(null);
      setChildProfile(null);
      setAuthInitialMode('select');
      setRole(null);
      return;
    }

    const latestChild = await getPersistedChildSession();
    if (latestChild) {
      setPersistedChild(latestChild);
      setChildProfile(latestChild);
      setRole('child');
    } else {
      setAuthInitialMode('select');
      setRole(null);
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        {initializing ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <>
            {role === 'parent' && (
              <View style={styles.navBar}>
                <View style={styles.brandRow}>
                  <Text style={styles.brandLogo}>📚 PageQuest</Text>
                  <View style={styles.rolePillParent}>
                    <Text style={styles.rolePillParentText} numberOfLines={1}>
                      Parent: {parentProfile?.name || ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.navButton, styles.redButton]}
                  onPress={handleParentLogout}
                  activeOpacity={0.85}
                >
                  <Text style={styles.navButtonText}>
                    {persistedChild ? `Child Mode (${persistedChild.name})` : "Sign Out"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {role === 'child' && (
              <View style={styles.navBar}>
                <View style={styles.brandRow}>
                  <Text style={styles.brandLogo}>📚 PageQuest</Text>
                  <View style={styles.rolePillChild}>
                    <Text style={styles.rolePillChildText} numberOfLines={1}>
                      ✓ {childProfile?.name || 'Reader'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.navButton, styles.outlineNavButton]}
                  onPress={handleOpenParentLogin}
                  activeOpacity={0.85}
                >
                  <Text style={styles.outlineNavButtonText}>🛡️ Parent Access</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.content}>
              {!role ? (
                <AuthScreen
                  key={authInitialMode}
                  initialMode={authInitialMode}
                  persistedChild={persistedChild}
                  onLoginSuccess={handleLoginSuccess}
                />
              ) : role === 'parent' ? (
                <ParentDashboardScreen
                  parentProfile={parentProfile}
                  persistedChild={persistedChild}
                  onDeviceChildLinked={(linkedChild) => {
                    setPersistedChild(linkedChild);
                    setChildProfile(linkedChild);
                  }}
                  onParentProfileUpdated={(updatedParent) => {
                    setParentProfile(updatedParent);
                  }}
                  onAccountDeleted={handleAccountDeleted}
                />
              ) : activeQuizData ? (
                <ChildQuizScreen
                  quizData={activeQuizData}
                  sessionInfo={currentSessionInfo}
                  onQuizCompleted={handleQuizCompleted}
                />
              ) : (
                <ChildReadingScreen
                  childProfile={childProfile}
                  onStartReading={(session) => console.log("Reading started:", session)}
                  onQuizReady={handleQuizReady}
                />
              )}
            </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  navBar: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: 10
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  brandLogo: { fontSize: 16, fontWeight: '900', color: COLORS.textPrimary },
  rolePillParent: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: 160
  },
  rolePillParentText: { fontSize: 12, fontWeight: '700', color: COLORS.primaryDark },
  rolePillChild: {
    backgroundColor: COLORS.successLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: 160
  },
  rolePillChildText: { fontSize: 12, fontWeight: '800', color: COLORS.successDark },
  navButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9
  },
  redButton: { backgroundColor: COLORS.danger },
  outlineNavButton: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  navButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  outlineNavButtonText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  content: { flex: 1 }
});
