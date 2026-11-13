import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getChildrenForParent,
  saveChildForParent,
  regenerateChildInviteCode,
  linkDeviceToChildByParent,
  updateParentAccount,
  getParentSettings,
  saveParentSettings,
  getFamilyContextForParent,
  deleteParentAccountAndData,
  DEFAULT_PARENT_SETTINGS
} from '../services/authService';
import {
  getParentNotifications,
  markAllParentNotificationsRead,
  clearParentNotifications,
  sendReadingReminderToChild,
  getChildLibrary,
  upsertBookInChildLibrary,
  getChildRewards,
  selectNextActiveReward,
  saveChildRewardItem,
  deleteChildRewardItem,
  toggleClaimChildRewardItem,
  reviewChildRewardRequest,
  computeChildReadingStats
} from '../services/notificationService';
import {
  sendChildInviteViaSms,
  sendCoParentInviteViaSms,
  sendReadingReminderViaSms,
  buildChildAccessLinks
} from '../services/smsService';
import { COLORS, SHADOWS } from '../theme';

export default function ParentDashboardScreen({
  parentProfile,
  persistedChild,
  onDeviceChildLinked,
  onParentProfileUpdated,
  onAccountDeleted
}) {
  // 5 Adult Tabs: 'library', 'quizzes', 'history', 'profiles', 'settings'
  const [activeTab, setActiveTab] = useState('library');

  const [children, setChildren] = useState([]);
  const [childrenLibraries, setChildrenLibraries] = useState({});
  const [childRewardsListMap, setChildRewardsListMap] = useState({});
  const [familyContext, setFamilyContext] = useState({
    familyId: parentProfile?.familyId || null,
    coParentInviteCode: parentProfile?.coParentInviteCode || '',
    coParents: [],
    familyParentIds: [],
    parentIds: []
  });
  const [liveReadingMap, setLiveReadingMap] = useState({});
  const [readingSessions, setReadingSessions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedQuizId, setExpandedQuizId] = useState(null);

  // Feedback banners
  const [actionMessage, setActionMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Library Tab: Recommend / Add Book to Child Form
  const [showAddBookForm, setShowAddBookForm] = useState(false);
  const [selectedChildForBook, setSelectedChildForBook] = useState('');
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [newBookStartPage, setNewBookStartPage] = useState('1');

  // Profiles Tab: Add / Edit Child Form State
  const [showChildForm, setShowChildForm] = useState(false);
  const [editingChildId, setEditingChildId] = useState(null);
  const [childNameInput, setChildNameInput] = useState('');
  const [childAgeInput, setChildAgeInput] = useState('');
  const [childPhoneInput, setChildPhoneInput] = useState('');

  // Profiles Tab: Co-Parent SMS Invite Phone Input
  const [coParentPhoneInput, setCoParentPhoneInput] = useState('');

  // Profiles Tab: Child Multi-Reward & Milestone Manager
  const [rewardChildId, setRewardChildId] = useState('');
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [editingRewardId, setEditingRewardId] = useState(null);
  const [rewardTitleInput, setRewardTitleInput] = useState('');
  const [rewardTargetInput, setRewardTargetInput] = useState('5');

  // Profiles Tab: Send Reading Reminder State
  const [reminderChildId, setReminderChildId] = useState('');
  const [reminderMessage, setReminderMessage] = useState(
    "Time for 20 minutes of reading! Open your book and log your pages."
  );
  const [reminderTimeLabel, setReminderTimeLabel] = useState('Today at 4:30 PM');

  // Settings Tab: Parent Account Form State
  const [acctName, setAcctName] = useState(parentProfile?.name || '');
  const [acctEmail, setAcctEmail] = useState(parentProfile?.email || '');
  const [acctPhone, setAcctPhone] = useState(parentProfile?.phoneNumber || '');
  const [acctAge, setAcctAge] = useState(parentProfile?.age ? String(parentProfile.age) : '');
  const [acctUsername, setAcctUsername] = useState(parentProfile?.username || '');
  const [acctNewPassword, setAcctNewPassword] = useState('');

  // Settings Tab: App & Notification Preferences State
  const [appSettings, setAppSettings] = useState({ ...DEFAULT_PARENT_SETTINGS });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const parentId = parentProfile?.userId || parentProfile?.id;

  const loadDashboardData = useCallback(async () => {
    try {
      const [
        linkedChildren,
        storedHistory,
        storedLiveStatus,
        storedNotifications,
        loadedSettings,
        loadedFamilyCtx
      ] = await Promise.all([
        getChildrenForParent(parentId),
        AsyncStorage.getItem('@reading_sessions_history'),
        AsyncStorage.getItem('@child_live_reading_status'),
        getParentNotifications(parentId),
        getParentSettings(parentId),
        getFamilyContextForParent(parentId)
      ]);

      setFamilyContext(loadedFamilyCtx);

      const kids = linkedChildren || [];
      setChildren(kids);
      if (kids.length > 0) {
        setSelectedChildForBook((prev) => prev || kids[0].id);
        setReminderChildId((prev) => prev || kids[0].id);
      }

      // Load each child's book library & rewards list
      const [libEntries, rewardListEntries] = await Promise.all([
        Promise.all(kids.map(async (c) => [c.id, await getChildLibrary(c.id)])),
        Promise.all(kids.map(async (c) => [c.id, await getChildRewards(c.id)]))
      ]);

      const libMap = {};
      libEntries.forEach(([cId, list]) => {
        libMap[cId] = list || [];
      });
      setChildrenLibraries(libMap);

      const rewardsListObj = {};
      rewardListEntries.forEach(([cId, list]) => {
        rewardsListObj[cId] = list || [];
      });
      setChildRewardsListMap(rewardsListObj);

      if (kids.length > 0) {
        setRewardChildId((prevId) => prevId || kids[0].id);
      }

      const childIds = kids.map((c) => c.id);
      const famParentIds = loadedFamilyCtx.familyParentIds || loadedFamilyCtx.parentIds || [];
      const parsedHistory = storedHistory ? JSON.parse(storedHistory) : [];
      const filteredHistory = parsedHistory.filter(
        (session) =>
          (loadedFamilyCtx.familyId && session.familyId === loadedFamilyCtx.familyId) ||
          famParentIds.includes(session.parentProfileId) ||
          session.parentProfileId === parentId ||
          childIds.includes(session.childId)
      );
      setReadingSessions(filteredHistory);

      setLiveReadingMap(storedLiveStatus ? JSON.parse(storedLiveStatus) : {});
      setNotifications(storedNotifications || []);
      setAppSettings(loadedSettings);
    } catch (e) {
      console.error("Failed to load parent dashboard data", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [parentId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    if (parentProfile) {
      setAcctName(parentProfile.name || '');
      setAcctEmail(parentProfile.email || '');
      setAcctPhone(parentProfile.phoneNumber || '');
      setAcctAge(parentProfile.age ? String(parentProfile.age) : '');
      setAcctUsername(parentProfile.username || '');
    }
  }, [parentProfile]);

  const clearBanners = () => {
    setActionMessage('');
    setErrorMessage('');
  };

  const handleSwitchTab = (tab) => {
    clearBanners();
    setActiveTab(tab);
  };

  // Library Tab: Add Book to Child's Library
  const handleAddBookToChildLibrary = async () => {
    clearBanners();
    const targetChildId = selectedChildForBook || children[0]?.id;
    if (!targetChildId || !newBookTitle.trim() || !newBookAuthor.trim()) {
      setErrorMessage("Please enter both a Book Title and Author.");
      return;
    }

    const startPg = parseInt(newBookStartPage, 10) || 1;
    await upsertBookInChildLibrary(targetChildId, {
      bookTitle: newBookTitle.trim(),
      author: newBookAuthor.trim(),
      startingPage: startPg,
      currentPage: startPg,
      addedBy: 'parent'
    });

    const targetChild = children.find((c) => c.id === targetChildId);
    setNewBookTitle('');
    setNewBookAuthor('');
    setNewBookStartPage('1');
    setShowAddBookForm(false);
    setActionMessage(`Added "${newBookTitle.trim()}" to ${targetChild?.name || 'your child'}'s Library!`);
    await loadDashboardData();
  };

  // Profiles Tab: Co-Parent SMS Invite
  const handleTextCoParentInvite = async () => {
    clearBanners();
    if (!coParentPhoneInput || coParentPhoneInput.trim().length < 7) {
      setErrorMessage("Please enter the co-parent's phone number to text the Family Code.");
      return;
    }
    const code = familyContext.coParentInviteCode || parentProfile?.coParentInviteCode;
    const res = await sendCoParentInviteViaSms({
      phoneNumber: coParentPhoneInput.trim(),
      invitingParentName: parentProfile?.name,
      coParentInviteCode: code
    });
    setCoParentPhoneInput('');
    if (res.success) {
      setActionMessage(
        `Opened SMS composer to ${coParentPhoneInput.trim()} with Co-Parent Family Code (${code})!`
      );
    } else {
      setActionMessage(
        `Co-Parent SMS Invite Ready (${code}):\n${res.messageBody}`
      );
    }
  };

  // Profiles Tab: Multi-Reward & Milestone Handlers
  const handleSelectRewardChild = (cId) => {
    setRewardChildId(cId);
    setEditingRewardId(null);
    setShowRewardForm(false);
    setRewardTitleInput('');
    setRewardTargetInput('5');
  };

  const handleOpenAddReward = () => {
    clearBanners();
    setEditingRewardId(null);
    setRewardTitleInput('');
    setRewardTargetInput('5');
    setShowRewardForm(true);
  };

  const handleOpenEditReward = (reward) => {
    clearBanners();
    setEditingRewardId(reward.id);
    setRewardTitleInput(reward.title);
    setRewardTargetInput(String(reward.targetQuizzes || 5));
    setShowRewardForm(true);
  };

  const handleSaveChildReward = async () => {
    clearBanners();
    const targetId = rewardChildId || children[0]?.id;
    const targetChild = children.find((c) => c.id === targetId);
    if (!targetChild) {
      setErrorMessage("Please add a child profile first.");
      return;
    }
    if (!rewardTitleInput.trim()) {
      setErrorMessage("Please enter a reward title (e.g., 'Pick Friday Movie & Treat!').");
      return;
    }
    const targetQuizzes = Math.max(1, parseInt(rewardTargetInput, 10) || 5);
    const res = await saveChildRewardItem(targetChild.id, {
      rewardId: editingRewardId,
      title: rewardTitleInput.trim(),
      targetQuizzes
    });
    if (res.success) {
      setChildRewardsListMap((prev) => ({ ...prev, [targetChild.id]: res.rewards }));
      setShowRewardForm(false);
      setEditingRewardId(null);
      setRewardTitleInput('');
      setRewardTargetInput('5');
      const msg = `${editingRewardId ? 'Updated' : 'Added'} reward for ${targetChild.name}: "${res.reward.title}" (${res.reward.targetQuizzes} passed quizzes)!`;
      setActionMessage(msg);
      Alert.alert("Reward Saved", msg);
    } else {
      setErrorMessage(res.error || "Failed to save reward.");
    }
  };

  const handleDeleteReward = async (cId, reward) => {
    clearBanners();
    const res = await deleteChildRewardItem(cId, reward.id);
    if (res.success) {
      setChildRewardsListMap((prev) => ({ ...prev, [cId]: res.rewards }));
      setActionMessage(`Removed reward "${reward.title}".`);
    }
  };

  const handleToggleClaimReward = async (cId, reward) => {
    clearBanners();
    const res = await toggleClaimChildRewardItem(cId, reward.id);
    if (res.success) {
      setChildRewardsListMap((prev) => ({ ...prev, [cId]: res.rewards }));
      setActionMessage(
        !reward.claimed
          ? `🎉 Marked "${reward.title}" as Claimed!`
          : `Marked "${reward.title}" as Unclaimed.`
      );
    }
  };

  const handleReviewRewardRequest = async (cId, reward, action) => {
    clearBanners();
    const res = await reviewChildRewardRequest(cId, reward.id, {
      action,
      targetQuizzes: reward.targetQuizzes
    });
    if (res.success) {
      setChildRewardsListMap((prev) => ({ ...prev, [cId]: res.rewards }));
      const msg =
        action === 'approve'
          ? `✓ Approved reward request "${reward.title}" (${reward.targetQuizzes} quizzes)!`
          : `Declined reward request "${reward.title}".`;
      setActionMessage(msg);
    }
  };

  // Profiles Tab: Add / Edit Child
  const handleOpenAddChild = () => {
    clearBanners();
    setEditingChildId(null);
    setChildNameInput('');
    setChildAgeInput('');
    setChildPhoneInput('');
    setShowChildForm(true);
  };

  const handleOpenEditChild = (child) => {
    clearBanners();
    setEditingChildId(child.id);
    setChildNameInput(child.name);
    setChildAgeInput(String(child.age));
    setChildPhoneInput(child.phoneNumber || '');
    setShowChildForm(true);
  };

  const handleSaveChild = async () => {
    clearBanners();
    const result = await saveChildForParent(parentId, {
      childId: editingChildId,
      name: childNameInput,
      age: childAgeInput,
      phoneNumber: childPhoneInput
    });

    if (!result.success) {
      setErrorMessage(result.error);
      Alert.alert("Validation Error", result.error);
      return;
    }

    setShowChildForm(false);
    setEditingChildId(null);
    setChildNameInput('');
    setChildAgeInput('');
    setChildPhoneInput('');
    setActionMessage(
      `Saved child profile for ${result.child.name} (Phone: ${result.child.phoneNumber} • 1-Time Code: ${result.child.inviteCode}).`
    );
    await loadDashboardData();
  };

  const handleTextInviteToChild = async (child) => {
    clearBanners();
    if (!child.phoneNumber) {
      setErrorMessage(`Please add a phone number for ${child.name} first using "Edit Info".`);
      return;
    }
    const res = await sendChildInviteViaSms({
      phoneNumber: child.phoneNumber,
      parentName: parentProfile?.name,
      childName: child.name,
      inviteCode: child.inviteCode
    });

    if (res.success) {
      setActionMessage(
        `Opened SMS composer to ${child.phoneNumber} with PageQuest download link & profile access link for ${child.name}!`
      );
    } else {
      setActionMessage(
        `SMS Invite Ready for ${child.name} (${child.phoneNumber}):\n${res.messageBody}`
      );
    }
  };

  const handleRegenerateCode = async (child) => {
    clearBanners();
    const result = await regenerateChildInviteCode(parentId, child.id);
    if (result.success) {
      const msg = `Generated new one-time invite code for ${child.name}: ${result.inviteCode}`;
      setActionMessage(msg);
      Alert.alert("New One-Time Code Generated", msg);
      await loadDashboardData();
    } else {
      setErrorMessage(result.error);
    }
  };

  const handleLinkDeviceToChild = async (child) => {
    clearBanners();
    const result = await linkDeviceToChildByParent(parentId, child.id);
    if (result.success) {
      if (onDeviceChildLinked) {
        onDeviceChildLinked(result.child);
      }
      const msg = `${result.child.name} is now set as the permanently logged-in child on this device.`;
      setActionMessage(msg);
      Alert.alert("Device Linked", msg);
      await loadDashboardData();
    } else {
      setErrorMessage(result.error);
    }
  };

  // Profiles Tab: Send Reading Reminder to Child
  const handleSendReminder = async (alsoSendSms = false) => {
    clearBanners();
    const targetId = reminderChildId || children[0]?.id;
    const targetChild = children.find((c) => c.id === targetId);
    if (!targetChild) {
      setErrorMessage("Please add or select a child profile first.");
      return;
    }

    const res = await sendReadingReminderToChild({
      familyId: familyContext.familyId || parentProfile?.familyId,
      parentProfileId: parentId,
      childId: targetChild.id,
      childName: targetChild.name,
      message: reminderMessage,
      scheduledTime: reminderTimeLabel
    });

    if (alsoSendSms && targetChild.phoneNumber) {
      await sendReadingReminderViaSms({
        phoneNumber: targetChild.phoneNumber,
        childName: targetChild.name,
        message: reminderMessage
      });
    }

    if (res.success) {
      const msg = alsoSendSms && targetChild.phoneNumber
        ? `Reading reminder sent to ${targetChild.name}'s app screen AND opened SMS text to ${targetChild.phoneNumber}!`
        : `Reading reminder sent to ${targetChild.name}'s profile screen!`;
      setActionMessage(msg);
      Alert.alert("Reminder Sent", msg);
    } else {
      setErrorMessage(res.error || "Failed to send reminder.");
    }
  };

  // History Tab: Notification Management
  const handleMarkNotificationsRead = async () => {
    const updated = await markAllParentNotificationsRead(parentId);
    setNotifications(updated);
  };

  const handleClearNotifications = async () => {
    await clearParentNotifications(parentId);
    setNotifications([]);
  };

  // Settings Tab: Save Parent Account Info
  const handleSaveAccountProfile = async () => {
    clearBanners();
    const res = await updateParentAccount(parentId, {
      name: acctName,
      email: acctEmail,
      phoneNumber: acctPhone,
      age: acctAge,
      username: acctUsername,
      newPassword: acctNewPassword ? acctNewPassword : null
    });

    if (!res.success) {
      setErrorMessage(res.error);
      Alert.alert("Update Error", res.error);
      return;
    }

    setAcctNewPassword('');
    if (onParentProfileUpdated) {
      onParentProfileUpdated(res.parent);
    }
    const msg = "Parent profile, phone number & account credentials updated!";
    setActionMessage(msg);
    Alert.alert("Saved", msg);
  };

  // Settings Tab: Save App & Notification Preferences
  const handleSaveAppSettings = async () => {
    clearBanners();
    const res = await saveParentSettings(parentId, appSettings);
    if (res.success) {
      const msg = "Notification & daily reminder settings saved for your family!";
      setActionMessage(msg);
      Alert.alert("Settings Saved", msg);
    } else {
      setErrorMessage(res.error || "Failed to save settings.");
    }
  };

  // Settings Tab: Permanently Delete Parent Account & Family Data (Store Compliance)
  const handleConfirmDeleteAccount = async (deleteEntireFamily = true) => {
    clearBanners();
    const res = await deleteParentAccountAndData(parentId, { deleteEntireFamily });
    if (!res.success) {
      setErrorMessage(res.error || "Failed to delete account.");
      Alert.alert("Deletion Error", res.error || "Failed to delete account.");
      return;
    }

    setShowDeleteConfirm(false);
    if (onAccountDeleted) {
      onAccountDeleted(res);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const unreadNotifCount = notifications.filter((n) => !n.read).length;
  const pendingRewardRequestsCount = Object.values(childRewardsListMap)
    .flat()
    .filter((r) => r && r.status === 'requested').length;
  const passedQuizzesCount = readingSessions.filter((s) => s.quizResult?.passed).length;
  const averageQuizScore =
    readingSessions.length > 0
      ? Math.round(
          readingSessions.reduce((acc, s) => acc + (s.quizResult?.scorePercentage || 0), 0) /
            readingSessions.length
        )
      : 0;
  const coParentsCount = familyContext?.coParents?.length || 1;

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
                loadDashboardData();
              }}
            />
          }
        >
          {/* Parent Overview Banner */}
          <View style={styles.parentHero}>
            <View style={styles.flexOne}>
              <Text style={styles.parentHeroTitle}>{parentProfile?.name || 'Parent'}'s Family Hub</Text>
              <Text style={styles.parentHeroSub}>
                @{parentProfile?.username} • 👨‍👩‍👧 {coParentsCount} Parent{coParentsCount === 1 ? '' : 's'} • {children.length} Child{children.length === 1 ? '' : 'ren'}
              </Text>
            </View>
            {unreadNotifCount > 0 && (
              <TouchableOpacity
                style={styles.unreadHeroPill}
                onPress={() => handleSwitchTab('history')}
              >
                <Text style={styles.unreadHeroPillText}>🔔 {unreadNotifCount} New</Text>
              </TouchableOpacity>
            )}
          </View>

          {actionMessage ? <Text style={styles.actionBanner}>{actionMessage}</Text> : null}
          {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

          {/* =========================================================
              TAB 1: LIBRARY (Live Reading Status, Streaks & Children's Bookshelves)
             ========================================================= */}
          {activeTab === 'library' && (
            <View>
              <Text style={styles.sectionTitle}>📖 Live Child Reading Status & Streaks</Text>
              {children.map((child) => {
                const live = liveReadingMap[child.id];
                const liveExtraPages =
                  live && live.status === 'Reading in progress'
                    ? Math.max(0, (Number(live.currentPage) || 0) - (Number(live.startingPage) || 0))
                    : 0;
                const childSessions = readingSessions.filter((s) => s.childId === child.id);
                const stats = computeChildReadingStats(
                  childSessions,
                  appSettings.dailyPageGoal || 15,
                  liveExtraPages
                );
                const childPassedQuizzes = childSessions.filter((s) => s.quizResult?.passed).length;
                const reward = selectNextActiveReward(
                  childRewardsListMap[child.id] || [],
                  childPassedQuizzes
                );

                return (
                  <View key={child.id} style={styles.card}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.childNameTitle}>{child.name} (Age {child.age})</Text>
                      <View style={styles.rowGap8}>
                        <View style={styles.streakPill}>
                          <Text style={styles.streakPillText}>🔥 {stats.streakDays}-Day Streak</Text>
                        </View>
                        <View style={styles.agePill}>
                          <Text style={styles.agePillText}>⏱️ {stats.totalMinutesRead}m read</Text>
                        </View>
                      </View>
                    </View>

                    {/* Daily Page Goal Bar */}
                    <View style={styles.dailyProgressBox}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.dailyProgressLabel}>
                          Today's Reading Goal ({stats.pagesReadToday} / {stats.dailyPageGoal} pages)
                        </Text>
                        <Text style={styles.dailyProgressPct}>{stats.dailyGoalPercent}%</Text>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${stats.dailyGoalPercent}%`,
                              backgroundColor:
                                stats.dailyGoalPercent >= 100 ? COLORS.success : COLORS.primary
                            }
                          ]}
                        />
                      </View>
                      {reward && (
                        <Text style={styles.rewardMiniLine}>
                          🎁 Reward Goal: "{reward.title}" ({childPassedQuizzes}/{reward.targetQuizzes} quizzes passed)
                        </Text>
                      )}
                    </View>

                    {live ? (
                      <View style={styles.liveBox}>
                        <Text style={styles.liveBookTitle}>📕 {live.bookTitle}</Text>
                        <Text style={styles.liveBookAuthor}>by {live.author}</Text>
                        <Text style={styles.livePageLine}>
                          Started Page {live.startingPage} → Currently on{' '}
                          <Text style={styles.boldText}>Page {live.currentPage}</Text>
                        </Text>
                        <Text style={styles.liveStatusBadge}>{live.status}</Text>
                      </View>
                    ) : (
                      <Text style={styles.mutedItalic}>No active book started right now.</Text>
                    )}
                  </View>
                );
              })}

              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>📚 Family Book Library</Text>
                <TouchableOpacity
                  style={styles.smallPrimaryBtn}
                  onPress={() => setShowAddBookForm(!showAddBookForm)}
                >
                  <Text style={styles.smallPrimaryBtnText}>
                    {showAddBookForm ? 'Close' : '+ Recommend Book'}
                  </Text>
                </TouchableOpacity>
              </View>

              {showAddBookForm && (
                <View style={styles.card}>
                  <Text style={styles.cardHeaderTitle}>Add a Book to Child's Library</Text>
                  {children.length > 1 && (
                    <View style={styles.chipRow}>
                      {children.map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            styles.childChip,
                            selectedChildForBook === c.id && styles.childChipActive
                          ]}
                          onPress={() => setSelectedChildForBook(c.id)}
                        >
                          <Text
                            style={[
                              styles.childChipText,
                              selectedChildForBook === c.id && styles.childChipTextActive
                            ]}
                          >
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={styles.label}>Book Title *</Text>
                  <TextInput
                    placeholder="e.g., Harry Potter and the Sorcerer's Stone"
                    placeholderTextColor={COLORS.textMuted}
                    value={newBookTitle}
                    onChangeText={setNewBookTitle}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Author *</Text>
                  <TextInput
                    placeholder="e.g., J.K. Rowling"
                    placeholderTextColor={COLORS.textMuted}
                    value={newBookAuthor}
                    onChangeText={setNewBookAuthor}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Starting Page</Text>
                  <TextInput
                    placeholder="1"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                    value={newBookStartPage}
                    onChangeText={setNewBookStartPage}
                    style={styles.input}
                  />

                  <TouchableOpacity
                    style={[styles.primaryButton, styles.indigoButton]}
                    onPress={handleAddBookToChildLibrary}
                  >
                    <Text style={styles.buttonText}>Add Book to Child's Shelf</Text>
                  </TouchableOpacity>
                </View>
              )}

              {children.map((child) => {
                const books = childrenLibraries[child.id] || [];
                return (
                  <View key={`lib_${child.id}`} style={styles.marginBottom16}>
                    <Text style={styles.subSectionLabel}>{child.name}'s Bookshelf ({books.length})</Text>
                    {books.length === 0 ? (
                      <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>
                          No books in {child.name}'s library yet. Tap "+ Recommend Book" above or have {child.name} start a book!
                        </Text>
                      </View>
                    ) : (
                      books.map((b) => (
                        <View key={b.id} style={styles.bookRowCard}>
                          <Text style={styles.bookEmoji}>📘</Text>
                          <View style={styles.flexOne}>
                            <Text style={styles.bookRowTitle}>{b.bookTitle}</Text>
                            <Text style={styles.bookRowAuthor}>by {b.author}</Text>
                            <Text style={styles.bookRowMeta}>
                              Current Page: {b.currentPage || 1} • 🏆 {b.quizzesPassed || 0} Quizzes Passed
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* =========================================================
              TAB 2: QUIZ RESULTS
             ========================================================= */}
          {activeTab === 'quizzes' && (
            <View>
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{readingSessions.length}</Text>
                  <Text style={styles.statLabel}>Total Quizzes</Text>
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

              <Text style={styles.sectionTitle}>🏆 Child Quiz Results & Breakdowns</Text>
              {readingSessions.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    No quizzes completed yet. Once your child completes a reading comprehension quiz, their score and full question breakdown will appear here.
                  </Text>
                </View>
              ) : (
                readingSessions.map((item, idx) => {
                  const res = item.quizResult;
                  const idKey = item.sessionId || String(idx);
                  const isExpanded = expandedQuizId === idKey;
                  return (
                    <View key={idKey} style={styles.card}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.readerTag}>Reader: {item.childName || 'Child'}</Text>
                        {res && (
                          <View style={[styles.scoreBadge, res.passed ? styles.passBadgeBg : styles.failBadgeBg]}>
                            <Text style={[styles.scoreBadgeText, res.passed ? styles.passBadgeText : styles.failBadgeText]}>
                              {res.scorePercentage}% ({res.correctCount}/{res.totalQuestions || 10})
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.cardHeaderTitle}>{item.bookTitle}</Text>
                      <Text style={styles.bookRowAuthor}>
                        by {item.author} • Pages {item.startingPage}–{item.endingPage}
                      </Text>

                      {res && Array.isArray(res.breakdown) && res.breakdown.length > 0 && (
                        <>
                          <TouchableOpacity
                            style={styles.toggleBreakdownBtn}
                            onPress={() => setExpandedQuizId(isExpanded ? null : idKey)}
                          >
                            <Text style={styles.toggleBreakdownText}>
                              {isExpanded ? 'Hide Question Breakdown ▲' : 'Inspect Questions & Answers ▼'}
                            </Text>
                          </TouchableOpacity>

                          {isExpanded && (
                            <View style={styles.breakdownBox}>
                              {res.breakdown.map((q) => (
                                <View key={q.questionNumber} style={styles.breakdownItem}>
                                  <Text style={styles.breakdownPrompt}>
                                    {q.isCorrect ? '✓' : '✗'} {q.questionNumber}. {q.prompt}
                                  </Text>
                                  <Text style={styles.breakdownSub}>
                                    Child Answered: <Text style={styles.boldText}>{q.selectedAnswer}</Text>
                                  </Text>
                                  {!q.isCorrect && (
                                    <Text style={styles.breakdownCorrect}>
                                      Correct Answer: {q.correctAnswer}
                                    </Text>
                                  )}
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

          {/* =========================================================
              TAB 3: HISTORY & NOTIFICATIONS
             ========================================================= */}
          {activeTab === 'history' && (
            <View>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>🔔 Parent Notifications ({notifications.length})</Text>
                {notifications.length > 0 && (
                  <View style={styles.rowGap8}>
                    {unreadNotifCount > 0 && (
                      <TouchableOpacity
                        style={styles.smallOutlineBtn}
                        onPress={handleMarkNotificationsRead}
                      >
                        <Text style={styles.smallOutlineBtnText}>Mark Read</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.smallOutlineBtn}
                      onPress={handleClearNotifications}
                    >
                      <Text style={styles.smallOutlineBtnText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {notifications.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    No parent notifications right now. You will receive alerts here whenever your child starts reading, updates pages, or finishes a quiz!
                  </Text>
                </View>
              ) : (
                notifications.slice(0, 12).map((notif) => (
                  <View
                    key={notif.id}
                    style={[styles.notifCard, !notif.read && styles.notifCardUnread]}
                  >
                    <View style={styles.rowBetween}>
                      <Text style={styles.notifTitle}>{notif.title}</Text>
                      {!notif.read && <Text style={styles.newDot}>NEW</Text>}
                    </View>
                    <Text style={styles.notifBody}>{notif.body}</Text>
                  </View>
                ))
              )}

              <Text style={[styles.sectionTitle, { marginTop: 14 }]}>
                🕒 Reading Session Timeline ({readingSessions.length})
              </Text>
              {readingSessions.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    No completed reading sessions recorded yet.
                  </Text>
                </View>
              ) : (
                readingSessions.map((item, idx) => {
                  const dateLabel = item.completedAt
                    ? new Date(item.completedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Completed';
                  return (
                    <View key={item.sessionId || String(idx)} style={styles.card}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.readerTag}>{item.childName || 'Child'}</Text>
                        <Text style={styles.dateMeta}>
                          {dateLabel} • ⏱️ {item.durationMinutes || 1}m read
                        </Text>
                      </View>
                      <Text style={styles.cardHeaderTitle}>{item.bookTitle}</Text>
                      <Text style={styles.bookRowAuthor}>
                        by {item.author} • Pages {item.startingPage}–{item.endingPage}
                      </Text>
                      {item.readingNote ? (
                        <Text style={styles.childNoteBanner}>
                          💬 Child's Note: "{item.readingNote}"
                        </Text>
                      ) : null}
                      {item.quizResult && (
                        <Text
                          style={[
                            styles.historyStatusLine,
                            { color: item.quizResult.passed ? COLORS.successDark : COLORS.dangerDark }
                          ]}
                        >
                          Quiz Score: {item.quizResult.scorePercentage}% ({item.quizResult.passed ? 'PASSED' : 'NEEDS REVIEW'})
                        </Text>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* =========================================================
              TAB 4: PROFILES, CO-PARENTS, REWARDS, SMS INVITES & REMINDERS
             ========================================================= */}
          {activeTab === 'profiles' && (
            <View>
              {/* Multi-Parent / Co-Parent Household Access Card */}
              <View style={[styles.card, styles.coParentCard]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardHeaderTitle}>🛡️ Multi-Parent Family Access</Text>
                  <View style={styles.coParentCodePill}>
                    <Text style={styles.coParentCodePillText} selectable>
                      Code: {familyContext.coParentInviteCode || parentProfile?.coParentInviteCode || 'N/A'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardSubtext}>
                  Share your 6-character Co-Parent Family Code so a second parent or guardian can join this household with their own login and see all children's activity.
                </Text>

                {/* Active Co-Parents List */}
                <View style={styles.coParentListBox}>
                  <Text style={styles.coParentListHeader}>
                    Parents & Guardians in This Family ({familyContext.coParents?.length || 1})
                  </Text>
                  {(familyContext.coParents || []).map((cp) => (
                    <View key={cp.userId} style={styles.coParentRow}>
                      <Text style={styles.coParentRowName}>
                        👤 {cp.name} (@{cp.username})
                      </Text>
                      <Text style={styles.coParentRowMeta}>📱 {cp.phoneNumber || 'No phone'}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.label}>Invite Co-Parent by Phone (SMS Text)</Text>
                <View style={styles.rowGap8}>
                  <TextInput
                    placeholder="Co-parent phone, e.g. (555) 444-3333"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                    value={coParentPhoneInput}
                    onChangeText={setCoParentPhoneInput}
                    style={[styles.input, styles.flexOne, { marginBottom: 0 }]}
                  />
                  <TouchableOpacity
                    style={[styles.primaryButton, styles.indigoButton]}
                    onPress={handleTextCoParentInvite}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>📱 Text Code</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Multi-Reward Milestones & Child Reward Requests Card */}
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardHeaderTitle}>🎁 Child Rewards & Milestones</Text>
                  <TouchableOpacity
                    style={styles.smallPrimaryBtn}
                    onPress={() => {
                      if (showRewardForm) {
                        setShowRewardForm(false);
                        setEditingRewardId(null);
                      } else {
                        handleOpenAddReward();
                      }
                    }}
                  >
                    <Text style={styles.smallPrimaryBtnText}>
                      {showRewardForm ? 'Close' : '+ Add Reward'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardSubtext}>
                  Add multiple custom reward milestones, mark unlocked rewards as claimed, or approve/deny rewards requested by your child.
                </Text>

                {children.length > 1 && (
                  <View style={styles.chipRow}>
                    {children.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.childChip,
                          rewardChildId === c.id && styles.childChipActive
                        ]}
                        onPress={() => handleSelectRewardChild(c.id)}
                      >
                        <Text
                          style={[
                            styles.childChipText,
                            rewardChildId === c.id && styles.childChipTextActive
                          ]}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {showRewardForm && (
                  <View style={styles.rewardEditorBox}>
                    <Text style={styles.rewardEditorHeader}>
                      {editingRewardId ? '✏️ Edit Reward Milestone' : '➕ Add New Reward Milestone'}
                    </Text>
                    <Text style={styles.label}>Reward / Prize Description *</Text>
                    <TextInput
                      placeholder="e.g., Pick Friday Family Movie & Treat! 🍕🎬"
                      placeholderTextColor={COLORS.textMuted}
                      value={rewardTitleInput}
                      onChangeText={setRewardTitleInput}
                      style={styles.input}
                    />

                    <Text style={styles.label}>Quizzes Passed Needed to Unlock *</Text>
                    <TextInput
                      placeholder="5"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numeric"
                      value={rewardTargetInput}
                      onChangeText={setRewardTargetInput}
                      style={styles.input}
                    />

                    <View style={styles.rowGap8}>
                      <TouchableOpacity
                        style={[styles.primaryButton, styles.greenButton, styles.flexOne]}
                        onPress={handleSaveChildReward}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.buttonText}>
                          {editingRewardId ? 'Save Changes' : '🎁 Add Reward'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.secondaryButton, styles.flexOne]}
                        onPress={() => {
                          setShowRewardForm(false);
                          setEditingRewardId(null);
                        }}
                      >
                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {(() => {
                  const targetCId = rewardChildId || children[0]?.id;
                  const kidRewards = childRewardsListMap[targetCId] || [];
                  const kidPassed = readingSessions.filter(
                    (s) => s.childId === targetCId && s.quizResult?.passed
                  ).length;

                  if (kidRewards.length === 0) {
                    return (
                      <Text style={styles.mutedItalic}>
                        No rewards set yet. Tap "+ Add Reward" above to create your first milestone!
                      </Text>
                    );
                  }

                  return kidRewards.map((rew) => {
                    const target = Math.max(1, Number(rew.targetQuizzes) || 5);
                    const isUnlocked = kidPassed >= target;

                    if (rew.status === 'requested') {
                      return (
                        <View key={rew.id} style={styles.requestedRewardBox}>
                          <View style={styles.rowBetween}>
                            <Text style={styles.requestedBadgeText}>
                              ⏳ CHILD REWARD REQUEST
                            </Text>
                            <Text style={styles.requestedGoalMeta}>
                              Suggested: {target} Quizzes
                            </Text>
                          </View>
                          <Text style={styles.rewardItemTitle}>{rew.title}</Text>
                          <View style={styles.profileActionButtonsRow}>
                            <TouchableOpacity
                              style={styles.approveBtn}
                              onPress={() => handleReviewRewardRequest(targetCId, rew, 'approve')}
                            >
                              <Text style={styles.smallPrimaryBtnText}>✓ Approve</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.denyBtn}
                              onPress={() => handleReviewRewardRequest(targetCId, rew, 'deny')}
                            >
                              <Text style={styles.smallPrimaryBtnText}>✗ Deny</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.smallOutlineBtn}
                              onPress={() => handleOpenEditReward(rew)}
                            >
                              <Text style={styles.smallOutlineBtnText}>Edit & Approve</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    }

                    return (
                      <View
                        key={rew.id}
                        style={[
                          styles.rewardListItem,
                          rew.claimed && styles.rewardListItemClaimed,
                          rew.status === 'denied' && styles.rewardListItemDenied
                        ]}
                      >
                        <View style={styles.rowBetween}>
                          <Text style={styles.rewardItemTitle}>{rew.title}</Text>
                          <Text
                            style={[
                              styles.rewardStatusPill,
                              rew.status === 'denied'
                                ? styles.failBadgeText
                                : rew.claimed || isUnlocked
                                ? styles.passBadgeText
                                : { color: COLORS.primary }
                            ]}
                          >
                            {rew.status === 'denied'
                              ? 'DECLINED'
                              : rew.claimed
                              ? '✓ CLAIMED'
                              : isUnlocked
                              ? '🎉 UNLOCKED'
                              : `${kidPassed}/${target} Quizzes`}
                          </Text>
                        </View>
                        <Text style={styles.rewardItemMeta}>
                          Milestone: Pass {target} Quiz{target === 1 ? '' : 'zes'} (90%+)
                          {rew.requestedBy === 'child' ? ' • ✨ Requested by Child' : ''}
                        </Text>

                        <View style={styles.profileActionButtonsRow}>
                          {rew.status === 'active' && (
                            <TouchableOpacity
                              style={rew.claimed ? styles.smallOutlineBtn : styles.smallSkyBtn}
                              onPress={() => handleToggleClaimReward(targetCId, rew)}
                            >
                              <Text
                                style={
                                  rew.claimed
                                    ? styles.smallOutlineBtnText
                                    : styles.smallPrimaryBtnText
                                }
                              >
                                {rew.claimed ? 'Unmark Claimed' : '🎉 Mark Claimed'}
                              </Text>
                            </TouchableOpacity>
                          )}

                          {rew.status === 'denied' && (
                            <TouchableOpacity
                              style={styles.approveBtn}
                              onPress={() => handleReviewRewardRequest(targetCId, rew, 'approve')}
                            >
                              <Text style={styles.smallPrimaryBtnText}>✓ Approve Now</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={styles.smallOutlineBtn}
                            onPress={() => handleOpenEditReward(rew)}
                          >
                            <Text style={styles.smallOutlineBtnText}>Edit</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.smallOutlineBtn}
                            onPress={() => handleDeleteReward(targetCId, rew)}
                          >
                            <Text style={[styles.smallOutlineBtnText, { color: COLORS.dangerDark }]}>
                              Delete
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  });
                })()}
              </View>

              {/* Send Reading Reminder to Child Card */}
              <View style={[styles.card, styles.reminderSendCard]}>
                <Text style={styles.cardHeaderTitle}>⏰ Send a Reminder to Read</Text>
                <Text style={styles.cardSubtext}>
                  Send a reading reminder banner to your child's app screen or text it directly to their phone.
                </Text>

                {children.length > 1 && (
                  <View style={styles.chipRow}>
                    {children.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.childChip,
                          reminderChildId === c.id && styles.childChipActive
                        ]}
                        onPress={() => setReminderChildId(c.id)}
                      >
                        <Text
                          style={[
                            styles.childChipText,
                            reminderChildId === c.id && styles.childChipTextActive
                          ]}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={styles.label}>Reminder Message</Text>
                <TextInput
                  placeholder="Write a motivating reminder for your child..."
                  placeholderTextColor={COLORS.textMuted}
                  value={reminderMessage}
                  onChangeText={setReminderMessage}
                  style={styles.input}
                />

                <Text style={styles.label}>When / Time Label</Text>
                <TextInput
                  placeholder="e.g., Today at 4:30 PM"
                  placeholderTextColor={COLORS.textMuted}
                  value={reminderTimeLabel}
                  onChangeText={setReminderTimeLabel}
                  style={styles.input}
                />

                <View style={styles.rowGap8}>
                  <TouchableOpacity
                    style={[styles.primaryButton, styles.amberButton, styles.flexOne]}
                    onPress={() => handleSendReminder(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>🔔 Send In-App Reminder</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryButton, styles.skyButton, styles.flexOne]}
                    onPress={() => handleSendReminder(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>📱 Send + Text SMS</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Child Profiles Management */}
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>👨‍👩‍👧 Linked Child Profiles ({children.length})</Text>
                <TouchableOpacity
                  style={styles.smallPrimaryBtn}
                  onPress={handleOpenAddChild}
                >
                  <Text style={styles.smallPrimaryBtnText}>+ Add Child</Text>
                </TouchableOpacity>
              </View>

              {showChildForm && (
                <View style={styles.card}>
                  <Text style={styles.cardHeaderTitle}>
                    {editingChildId ? 'Edit Child Profile & Phone' : 'Create New Linked Child Profile'}
                  </Text>
                  <Text style={styles.label}>Child's Name *</Text>
                  <TextInput
                    placeholder="Child's Name"
                    placeholderTextColor={COLORS.textMuted}
                    value={childNameInput}
                    onChangeText={setChildNameInput}
                    style={styles.input}
                  />
                  <Text style={styles.label}>Child's Age (3–18) *</Text>
                  <TextInput
                    placeholder="Age"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                    value={childAgeInput}
                    onChangeText={setChildAgeInput}
                    style={styles.input}
                  />
                  <Text style={styles.label}>Child's Phone Number * (for SMS invite & access link)</Text>
                  <TextInput
                    placeholder="e.g., (555) 987-6543"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                    value={childPhoneInput}
                    onChangeText={setChildPhoneInput}
                    style={styles.input}
                  />
                  <View style={styles.rowGap8}>
                    <TouchableOpacity
                      style={[styles.primaryButton, styles.greenButton, styles.flexOne]}
                      onPress={handleSaveChild}
                    >
                      <Text style={styles.buttonText}>Save Child</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.secondaryButton, styles.flexOne]}
                      onPress={() => setShowChildForm(false)}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {children.map((child) => {
                const isLinkedOnThisDevice = persistedChild?.id === child.id;
                const accessLinks = buildChildAccessLinks(child.inviteCode);
                return (
                  <View key={child.id} style={styles.card}>
                    <View style={styles.rowBetween}>
                      <View style={styles.flexOne}>
                        <Text style={styles.childNameTitle}>{child.name} (Age {child.age})</Text>
                        <Text style={styles.childPhoneText}>
                          📱 Phone: {child.phoneNumber || 'Not set'}
                        </Text>
                        {child.inviteCodeUsed ? (
                          <Text style={styles.claimedText}>
                            ✓ 1-Time Code Claimed ({child.inviteCode}) — Permanently Logged In
                          </Text>
                        ) : (
                          <Text style={styles.unusedCodeText} selectable>
                            🔑 One-Time Invite Code: {child.inviteCode}
                          </Text>
                        )}
                        <Text style={styles.accessLinkText} selectable>
                          🔗 Profile Access Link: {accessLinks.accessLink}
                        </Text>
                        {isLinkedOnThisDevice && (
                          <Text style={styles.activeDeviceTag}>• Active Reader on This Device</Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.profileActionButtonsRow}>
                      <TouchableOpacity
                        style={styles.smallSkyBtn}
                        onPress={() => handleTextInviteToChild(child)}
                      >
                        <Text style={styles.smallPrimaryBtnText}>📱 Text App & Invite Link</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.smallOutlineBtn}
                        onPress={() => handleOpenEditChild(child)}
                      >
                        <Text style={styles.smallOutlineBtnText}>Edit Info</Text>
                      </TouchableOpacity>

                      {!isLinkedOnThisDevice && (
                        <TouchableOpacity
                          style={styles.smallPrimaryBtn}
                          onPress={() => handleLinkDeviceToChild(child)}
                        >
                          <Text style={styles.smallPrimaryBtnText}>Link This Device</Text>
                        </TouchableOpacity>
                      )}

                      {child.inviteCodeUsed && (
                        <TouchableOpacity
                          style={styles.smallOutlineBtn}
                          onPress={() => handleRegenerateCode(child)}
                        >
                          <Text style={styles.smallOutlineBtnText}>New 1-Time Code</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* =========================================================
              TAB 5: ACCOUNT & APP SETTINGS (Adults Only)
             ========================================================= */}
          {activeTab === 'settings' && (
            <View>
              {/* Parent Account & Profile Settings */}
              <View style={styles.card}>
                <Text style={styles.cardHeaderTitle}>👤 Parent Account & Profile</Text>
                <Text style={styles.cardSubtext}>
                  Update your required parent profile information, phone number, username, or password.
                </Text>

                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  value={acctName}
                  onChangeText={setAcctName}
                  placeholder="Full Name"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />

                <Text style={styles.label}>Email Address *</Text>
                <TextInput
                  value={acctEmail}
                  onChangeText={setAcctEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="Email Address"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />

                <Text style={styles.label}>Phone Number *</Text>
                <TextInput
                  value={acctPhone}
                  onChangeText={setAcctPhone}
                  keyboardType="phone-pad"
                  placeholder="e.g., (555) 234-5678"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />

                <Text style={styles.label}>Age * (18+)</Text>
                <TextInput
                  value={acctAge}
                  onChangeText={setAcctAge}
                  keyboardType="numeric"
                  placeholder="Age"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />

                <Text style={styles.label}>Username *</Text>
                <TextInput
                  value={acctUsername}
                  onChangeText={setAcctUsername}
                  autoCapitalize="none"
                  placeholder="Username"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />

                <Text style={styles.label}>New Password (leave blank to keep current)</Text>
                <TextInput
                  value={acctNewPassword}
                  onChangeText={setAcctNewPassword}
                  secureTextEntry
                  placeholder="Enter new password (min 6 chars)"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />

                <TouchableOpacity
                  style={[styles.primaryButton, styles.indigoButton]}
                  onPress={handleSaveAccountProfile}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonText}>Save Account Profile</Text>
                </TouchableOpacity>
              </View>

              {/* Notification & Reading Reminder Preferences */}
              <View style={styles.card}>
                <Text style={styles.cardHeaderTitle}>🔔 Notification & Reminder Settings</Text>
                <Text style={styles.cardSubtext}>
                  Customize parent notifications and daily child reading reminders across your family household.
                </Text>

                <View style={styles.switchRow}>
                  <View style={styles.flexOne}>
                    <Text style={styles.switchTitle}>Notify when child starts reading</Text>
                    <Text style={styles.switchSub}>Receive an alert when a new reading session begins</Text>
                  </View>
                  <Switch
                    value={Boolean(appSettings.notifyOnReadingStart)}
                    onValueChange={(val) =>
                      setAppSettings((prev) => ({ ...prev, notifyOnReadingStart: val }))
                    }
                    trackColor={{ false: '#CBD5E1', true: '#818CF8' }}
                    thumbColor={appSettings.notifyOnReadingStart ? COLORS.primary : '#F8FAFC'}
                  />
                </View>

                <View style={styles.switchRow}>
                  <View style={styles.flexOne}>
                    <Text style={styles.switchTitle}>Notify on page progress updates</Text>
                    <Text style={styles.switchSub}>Receive an alert when your child updates their bookmark</Text>
                  </View>
                  <Switch
                    value={Boolean(appSettings.notifyOnPageUpdate)}
                    onValueChange={(val) =>
                      setAppSettings((prev) => ({ ...prev, notifyOnPageUpdate: val }))
                    }
                    trackColor={{ false: '#CBD5E1', true: '#818CF8' }}
                    thumbColor={appSettings.notifyOnPageUpdate ? COLORS.primary : '#F8FAFC'}
                  />
                </View>

                <View style={styles.switchRow}>
                  <View style={styles.flexOne}>
                    <Text style={styles.switchTitle}>Notify on quiz activation & scores</Text>
                    <Text style={styles.switchSub}>Receive immediate alerts when quizzes are completed</Text>
                  </View>
                  <Switch
                    value={Boolean(appSettings.notifyOnQuizComplete)}
                    onValueChange={(val) =>
                      setAppSettings((prev) => ({ ...prev, notifyOnQuizComplete: val }))
                    }
                    trackColor={{ false: '#CBD5E1', true: '#818CF8' }}
                    thumbColor={appSettings.notifyOnQuizComplete ? COLORS.primary : '#F8FAFC'}
                  />
                </View>

                <View style={styles.switchRow}>
                  <View style={styles.flexOne}>
                    <Text style={styles.switchTitle}>Daily Reading Reminders for Child</Text>
                    <Text style={styles.switchSub}>Show a daily reading reminder banner on child's screen</Text>
                  </View>
                  <Switch
                    value={Boolean(appSettings.childRemindersEnabled)}
                    onValueChange={(val) =>
                      setAppSettings((prev) => ({ ...prev, childRemindersEnabled: val }))
                    }
                    trackColor={{ false: '#CBD5E1', true: '#34D399' }}
                    thumbColor={appSettings.childRemindersEnabled ? COLORS.success : '#F8FAFC'}
                  />
                </View>

                <Text style={[styles.label, { marginTop: 10 }]}>Daily Reminder Time</Text>
                <TextInput
                  value={String(appSettings.dailyReminderTime || '')}
                  onChangeText={(val) =>
                    setAppSettings((prev) => ({ ...prev, dailyReminderTime: val }))
                  }
                  placeholder="e.g., 4:30 PM"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />

                <Text style={styles.label}>Default Daily Reminder Message</Text>
                <TextInput
                  value={String(appSettings.defaultReminderMessage || '')}
                  onChangeText={(val) =>
                    setAppSettings((prev) => ({ ...prev, defaultReminderMessage: val }))
                  }
                  placeholder="Time for your daily reading!"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />

                <Text style={styles.label}>Daily Reading Goal (Pages per Day)</Text>
                <TextInput
                  value={String(appSettings.dailyPageGoal || '15')}
                  onChangeText={(val) =>
                    setAppSettings((prev) => ({
                      ...prev,
                      dailyPageGoal: parseInt(val, 10) || 15
                    }))
                  }
                  keyboardType="numeric"
                  placeholder="15"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.input}
                />

                <TouchableOpacity
                  style={[styles.primaryButton, styles.greenButton]}
                  onPress={handleSaveAppSettings}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonText}>Save Notification & Reminder Settings</Text>
                </TouchableOpacity>
              </View>

              {/* Privacy & Account Deletion (Apple App Store & Google Play Store Compliance) */}
              <View style={[styles.card, styles.dangerZoneCard]}>
                <Text style={styles.cardHeaderTitle}>🔒 Privacy & Data Management</Text>
                <Text style={styles.cardSubtext}>
                  PageQuest stores your family's reading progress, quiz scores, and reward milestones solely for your household and never sells or shares personal data with third-party advertisers. You may permanently delete your parent account and all linked child profiles at any time.
                </Text>

                {!showDeleteConfirm ? (
                  <TouchableOpacity
                    style={[styles.primaryButton, styles.redButton]}
                    onPress={() => setShowDeleteConfirm(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.buttonText}>🗑️ Delete Account & Family Data</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.deleteConfirmBox}>
                    <Text style={styles.deleteWarningTitle}>
                      ⚠️ Confirm Permanent Account Deletion
                    </Text>
                    <Text style={styles.deleteWarningBody}>
                      This action cannot be undone. Deleting your family account will permanently erase your parent login, all linked child profiles ({children.length}), book libraries, reading history, and reward milestones.
                    </Text>

                    <View style={styles.rowGap8}>
                      <TouchableOpacity
                        style={[styles.primaryButton, styles.redButton, styles.flexOne]}
                        onPress={() => handleConfirmDeleteAccount(true)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.buttonText}>Yes, Permanently Delete All Data</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.secondaryButton, styles.flexOne]}
                        onPress={() => setShowDeleteConfirm(false)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>

                    {coParentsCount > 1 && (
                      <TouchableOpacity
                        style={[styles.smallOutlineBtn, { marginTop: 10, alignSelf: 'flex-start' }]}
                        onPress={() => handleConfirmDeleteAccount(false)}
                      >
                        <Text style={[styles.smallOutlineBtnText, { color: COLORS.dangerDark }]}>
                          Only remove my Co-Parent login (keep family & children for other parent)
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Tab Bar for Adults (5 Tabs: Library, Quiz Results, History, Profiles, Settings) */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'library' && styles.activeTabButton]}
          onPress={() => handleSwitchTab('library')}
          activeOpacity={0.8}
        >
          <Text style={styles.tabIcon}>📚</Text>
          <Text style={[styles.tabLabel, activeTab === 'library' && styles.activeTabLabel]}>Library</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'quizzes' && styles.activeTabButton]}
          onPress={() => handleSwitchTab('quizzes')}
          activeOpacity={0.8}
        >
          <Text style={styles.tabIcon}>🏆</Text>
          <Text style={[styles.tabLabel, activeTab === 'quizzes' && styles.activeTabLabel]}>Quizzes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'history' && styles.activeTabButton]}
          onPress={() => handleSwitchTab('history')}
          activeOpacity={0.8}
        >
          <View>
            <Text style={styles.tabIcon}>🕒</Text>
            {unreadNotifCount > 0 && <View style={styles.tabBadgeDot} />}
          </View>
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.activeTabLabel]}>History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'profiles' && styles.activeTabButton]}
          onPress={() => handleSwitchTab('profiles')}
          activeOpacity={0.8}
        >
          <View>
            <Text style={styles.tabIcon}>👨‍👩‍👧</Text>
            {pendingRewardRequestsCount > 0 && <View style={styles.tabBadgeDot} />}
          </View>
          <Text style={[styles.tabLabel, activeTab === 'profiles' && styles.activeTabLabel]}>Profiles</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'settings' && styles.activeTabButton]}
          onPress={() => handleSwitchTab('settings')}
          activeOpacity={0.8}
        >
          <Text style={styles.tabIcon}>⚙️</Text>
          <Text style={[styles.tabLabel, activeTab === 'settings' && styles.activeTabLabel]}>Settings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: COLORS.background },
  flexOne: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 32 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  parentHero: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOWS.card
  },
  parentHeroTitle: { fontSize: 19, fontWeight: '800', color: '#FFFFFF' },
  parentHeroSub: { fontSize: 13, color: '#C7D2FE', marginTop: 3, fontWeight: '600' },
  unreadHeroPill: {
    backgroundColor: COLORS.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  },
  unreadHeroPillText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  actionBanner: {
    backgroundColor: COLORS.successLight,
    color: COLORS.successDark,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    fontSize: 13,
    fontWeight: '700'
  },
  errorBanner: {
    backgroundColor: COLORS.dangerLight,
    color: COLORS.dangerDark,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    fontSize: 13,
    fontWeight: '700'
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 10 },
  subSectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
    flexWrap: 'wrap'
  },
  rowGap8: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marginBottom16: { marginBottom: 16 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card
  },
  coParentCard: {
    borderColor: '#C7D2FE',
    borderWidth: 1.5
  },
  coParentCodePill: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999
  },
  coParentCodePillText: { fontSize: 12, fontWeight: '900', color: COLORS.primaryDark },
  coParentListBox: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  coParentListHeader: { fontSize: 12, fontWeight: '800', color: COLORS.textSecondary, marginBottom: 6 },
  coParentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4
  },
  coParentRowName: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  coParentRowMeta: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  reminderSendCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A'
  },
  cardHeaderTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 4 },
  cardSubtext: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 14, lineHeight: 19 },
  childNameTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  childPhoneText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginTop: 2 },
  streakPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  streakPillText: { fontSize: 11, fontWeight: '800', color: '#92400E' },
  agePill: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  agePillText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  dailyProgressBox: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  dailyProgressLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
  dailyProgressPct: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999
  },
  rewardMiniLine: { fontSize: 12, fontWeight: '700', color: '#92400E', marginTop: 6 },
  rewardEditorBox: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  rewardEditorHeader: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginBottom: 10 },
  requestedRewardBox: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 13,
    marginBottom: 10
  },
  requestedBadgeText: { fontSize: 11, fontWeight: '900', color: COLORS.warningDark },
  requestedGoalMeta: { fontSize: 12, fontWeight: '700', color: '#92400E' },
  rewardListItem: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  rewardListItemClaimed: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0'
  },
  rewardListItemDenied: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA'
  },
  rewardItemTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary, flex: 1 },
  rewardItemMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, fontWeight: '600' },
  rewardStatusPill: { fontSize: 12, fontWeight: '800' },
  approveBtn: {
    backgroundColor: COLORS.success,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10
  },
  denyBtn: {
    backgroundColor: COLORS.danger,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10
  },
  liveBox: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4
  },
  liveBookTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  liveBookAuthor: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  livePageLine: { fontSize: 13, color: COLORS.textPrimary },
  liveStatusBadge: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginTop: 4 },
  mutedItalic: { fontSize: 13, fontStyle: 'italic', color: COLORS.textMuted, marginTop: 4 },
  boldText: { fontWeight: '800' },
  smallPrimaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10
  },
  smallSkyBtn: {
    backgroundColor: COLORS.secondary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10
  },
  smallPrimaryBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  smallOutlineBtn: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10
  },
  smallOutlineBtnText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface
  },
  childChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  childChipText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  childChipTextActive: { color: '#FFFFFF' },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 12,
    borderRadius: 10,
    fontSize: 15
  },
  primaryButton: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButton: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  indigoButton: { backgroundColor: COLORS.primary },
  skyButton: { backgroundColor: COLORS.secondary },
  greenButton: { backgroundColor: COLORS.success },
  amberButton: { backgroundColor: COLORS.warning },
  redButton: { backgroundColor: COLORS.danger },
  dangerZoneCard: {
    borderColor: '#FECACA',
    borderWidth: 1.5
  },
  deleteConfirmBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14
  },
  deleteWarningTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.dangerDark,
    marginBottom: 6
  },
  deleteWarningBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: 14
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12
  },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19 },
  bookRowCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  bookEmoji: { fontSize: 24 },
  bookRowTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  bookRowAuthor: { fontSize: 13, color: COLORS.textSecondary },
  bookRowMeta: { fontSize: 12, color: COLORS.primary, fontWeight: '700', marginTop: 3 },
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
  readerTag: { fontSize: 12, fontWeight: '800', color: COLORS.primary, textTransform: 'uppercase' },
  dateMeta: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  scoreBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  passBadgeBg: { backgroundColor: COLORS.successLight },
  failBadgeBg: { backgroundColor: COLORS.dangerLight },
  scoreBadgeText: { fontSize: 12, fontWeight: '800' },
  passBadgeText: { color: COLORS.successDark },
  failBadgeText: { color: COLORS.dangerDark },
  toggleBreakdownBtn: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  toggleBreakdownText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  breakdownBox: { marginTop: 10, backgroundColor: COLORS.surfaceAlt, padding: 12, borderRadius: 10 },
  breakdownItem: { marginBottom: 10 },
  breakdownPrompt: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
  breakdownSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  breakdownCorrect: { fontSize: 12, color: COLORS.successDark, fontWeight: '700', marginTop: 1 },
  notifCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 13,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  notifCardUnread: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D'
  },
  notifTitle: { fontSize: 14, fontWeight: '800', color: COLORS.textPrimary },
  newDot: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.warningDark,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999
  },
  notifBody: { fontSize: 13, color: COLORS.textSecondary, marginTop: 3, lineHeight: 18 },
  childNoteBanner: {
    fontSize: 13,
    fontStyle: 'italic',
    color: COLORS.primaryDark,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6
  },
  historyStatusLine: { fontSize: 13, fontWeight: '800', marginTop: 6 },
  claimedText: { fontSize: 13, fontWeight: '700', color: COLORS.successDark, marginTop: 4 },
  unusedCodeText: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginTop: 4 },
  accessLinkText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  activeDeviceTag: { fontSize: 12, fontWeight: '700', color: COLORS.secondary, marginTop: 3 },
  profileActionButtonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 12
  },
  switchTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  switchSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 8,
    paddingHorizontal: 6
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 10
  },
  activeTabButton: { backgroundColor: COLORS.primaryLight },
  tabIcon: { fontSize: 17, marginBottom: 2 },
  tabLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  activeTabLabel: { color: COLORS.primary, fontWeight: '800' },
  tabBadgeDot: {
    position: 'absolute',
    right: -4,
    top: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger
  }
});
