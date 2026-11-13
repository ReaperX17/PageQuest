import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import {
  registerParentAccount,
  loginParent,
  verifyAndClaimChildInvite
} from '../services/authService';
import {
  sendChildInviteViaSms,
  buildChildInviteSmsMessage,
  buildChildAccessLinks
} from '../services/smsService';
import { COLORS, SHADOWS } from '../theme';

export default function AuthScreen({ onLoginSuccess, persistedChild, initialMode = 'select' }) {
  const [mode, setMode] = useState(initialMode); // 'select', 'parent_login', 'parent_register', 'child_login'
  const [errorMessage, setErrorMessage] = useState('');
  const [smsStatusMessage, setSmsStatusMessage] = useState('');

  // Parent Login State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Parent Registration State (All Required)
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentAge, setParentAge] = useState('');
  const [parentUsername, setParentUsername] = useState('');
  const [parentPassword, setParentPassword] = useState('');

  // Co-Parent Join vs. New Family Toggle
  const [joinExistingFamily, setJoinExistingFamily] = useState(false);
  const [coParentCodeInput, setCoParentCodeInput] = useState('');

  // Linked Child Profile Setup State (When starting a new family)
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [childPhone, setChildPhone] = useState('');
  const [registeredResult, setRegisteredResult] = useState(null);

  // Child One-Time Invite Code State
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  const switchMode = (newMode) => {
    setErrorMessage('');
    setSmsStatusMessage('');
    setMode(newMode);
  };

  const handleParentLogin = async () => {
    setErrorMessage('');
    const result = await loginParent(loginUsername, loginPassword);
    if (!result.success) {
      setErrorMessage(result.error);
      Alert.alert("Login Failed", result.error);
      return;
    }
    onLoginSuccess('parent', result.parent);
  };

  const handleParentRegister = async () => {
    setErrorMessage('');
    setSmsStatusMessage('');
    const result = await registerParentAccount(
      {
        name: parentName,
        email: parentEmail,
        phoneNumber: parentPhone,
        age: parentAge,
        username: parentUsername,
        password: parentPassword
      },
      {
        name: childName,
        age: childAge,
        phoneNumber: childPhone
      },
      {
        joinExistingFamily,
        coParentCodeInput
      }
    );

    if (!result.success) {
      setErrorMessage(result.error);
      Alert.alert("Registration Error", result.error);
      return;
    }

    setRegisteredResult(result);
    if (result.joinedExistingFamily) {
      Alert.alert(
        "Co-Parent Linked!",
        `Welcome ${result.parent.name}! Your account is now linked to your family household.`
      );
    } else {
      Alert.alert(
        "Account & Child Profile Created!",
        `Your Parent Account (@${result.parent.username}), Co-Parent Family Code (${result.coParentInviteCode}), and Child Profile (${result.child.name}) are ready!`
      );
    }
  };

  const handleSendInviteSms = async () => {
    if (!registeredResult?.child) return;
    const res = await sendChildInviteViaSms({
      phoneNumber: registeredResult.child.phoneNumber,
      parentName: registeredResult.parent.name,
      childName: registeredResult.child.name,
      inviteCode: registeredResult.inviteCode
    });

    if (res.success) {
      setSmsStatusMessage(
        `Opened SMS composer to ${registeredResult.child.phoneNumber} with download link & profile access code!`
      );
    } else {
      setSmsStatusMessage(
        `Ready to text ${registeredResult.child.phoneNumber}! Copy or send the SMS invite message shown below.`
      );
    }
  };

  const handleChildLogin = async () => {
    setErrorMessage('');
    const result = await verifyAndClaimChildInvite(inviteCodeInput);
    if (result.success) {
      Alert.alert(
        "Permanently Logged In!",
        `Welcome ${result.child.name}! Your one-time code has been activated and you are now permanently logged in on this device.`
      );
      onLoginSuccess('child', result.child);
    } else {
      setErrorMessage(result.error);
      Alert.alert("Invite Code Error", result.error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screenContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroHeader}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>📚</Text>
          </View>
          <Text style={styles.title}>PageQuest</Text>
          <Text style={styles.subtitle}>Family Reading Tracker & AI Comprehension Quizzes</Text>
        </View>

        {mode === 'select' && (
          <View>
            {persistedChild && (
              <View style={[styles.card, styles.permanentChildCard]}>
                <View style={styles.badgePillGreen}>
                  <Text style={styles.badgePillGreenText}>✓ DEVICE LINKED</Text>
                </View>
                <Text style={styles.cardTitle}>Welcome back, {persistedChild.name}!</Text>
                <Text style={styles.cardDescription}>
                  Your reader profile (Age {persistedChild.age}) is permanently logged in on this device.
                </Text>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.greenButton]}
                  onPress={() => onLoginSuccess('child', persistedChild)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonText}>Open {persistedChild.name}'s Reading Space →</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardEmoji}>🛡️</Text>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>Parent & Co-Parent Portal</Text>
                  <Text style={styles.cardSubtitle}>Multi-parent access, rewards & quiz tracking</Text>
                </View>
              </View>
              <Text style={styles.cardDescription}>
                Sign in with your username and password, create a new family household, or join an existing family as a co-parent.
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, styles.indigoButton, styles.buttonSpacing]}
                onPress={() => switchMode('parent_login')}
                activeOpacity={0.85}
              >
                <Text style={styles.buttonText}>Parent Sign In</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.outlineButton}
                onPress={() => switchMode('parent_register')}
                activeOpacity={0.85}
              >
                <Text style={styles.outlineButtonText}>Create Parent / Co-Parent Account</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardEmoji}>🌟</Text>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>Child Reader Setup</Text>
                  <Text style={styles.cardSubtitle}>One-time invite code or SMS link activation</Text>
                </View>
              </View>
              <Text style={styles.cardDescription}>
                Tap the access link texted by your parent or enter your 6-character one-time invite code once to permanently unlock your reading library and quizzes.
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, styles.greenButton]}
                onPress={() => switchMode('child_login')}
                activeOpacity={0.85}
              >
                <Text style={styles.buttonText}>Enter One-Time Invite Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {mode === 'parent_login' && (
          <View style={styles.card}>
            <Text style={styles.header}>Parent Sign In</Text>
            <Text style={styles.subtext}>
              Enter your parent username and password to access your shared family library, quiz results, rewards, and settings.
            </Text>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Text style={styles.label}>Username *</Text>
            <TextInput
              placeholder="Enter your username"
              placeholderTextColor={COLORS.textMuted}
              value={loginUsername}
              onChangeText={setLoginUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              style={styles.input}
            />

            <Text style={styles.label}>Password *</Text>
            <TextInput
              placeholder="Enter your password"
              placeholderTextColor={COLORS.textMuted}
              value={loginPassword}
              onChangeText={setLoginPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleParentLogin}
              style={styles.input}
            />

            <TouchableOpacity
              style={[styles.primaryButton, styles.indigoButton, styles.buttonSpacing]}
              onPress={handleParentLogin}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>Sign In to Parent Dashboard</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => switchMode('parent_register')} style={styles.linkButton}>
              <Text style={styles.linkText}>Don't have an account? Register Parent or Co-Parent</Text>
            </TouchableOpacity>

            {persistedChild && (
              <TouchableOpacity
                style={[styles.primaryButton, styles.greenButton, styles.backButton]}
                onPress={() => onLoginSuccess('child', persistedChild)}
                activeOpacity={0.85}
              >
                <Text style={styles.buttonText}>Return to {persistedChild.name}'s Reader Mode</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.secondaryButton, styles.backButton]}
              onPress={() => switchMode('select')}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>← Back to Home</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'parent_register' && (
          <View style={styles.card}>
            <Text style={styles.header}>Create Parent Account</Text>
            <Text style={styles.subtext}>
              Register your parent profile and either start a new family or join your co-parent's existing family household.
            </Text>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            {!registeredResult ? (
              <>
                <View style={styles.sectionBox}>
                  <Text style={styles.subHeader}>1. Parent Information (Required)</Text>

                  <Text style={styles.label}>Full Name *</Text>
                  <TextInput
                    placeholder="e.g., Jordan Taylor"
                    placeholderTextColor={COLORS.textMuted}
                    value={parentName}
                    onChangeText={setParentName}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Email Address *</Text>
                  <TextInput
                    placeholder="e.g., parent@example.com"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={parentEmail}
                    onChangeText={setParentEmail}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Parent Phone Number *</Text>
                  <TextInput
                    placeholder="e.g., (555) 234-5678"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                    value={parentPhone}
                    onChangeText={setParentPhone}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Parent Age * (18+)</Text>
                  <TextInput
                    placeholder="e.g., 35"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                    value={parentAge}
                    onChangeText={setParentAge}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Username * (min 3 characters)</Text>
                  <TextInput
                    placeholder="Choose a username"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={parentUsername}
                    onChangeText={setParentUsername}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Password * (min 6 characters)</Text>
                  <TextInput
                    placeholder="Choose a password"
                    placeholderTextColor={COLORS.textMuted}
                    secureTextEntry
                    value={parentPassword}
                    onChangeText={setParentPassword}
                    style={styles.input}
                  />
                </View>

                {/* Family Setup Mode Selector */}
                <View style={styles.familyModeToggleRow}>
                  <TouchableOpacity
                    style={[styles.modePill, !joinExistingFamily && styles.modePillActive]}
                    onPress={() => setJoinExistingFamily(false)}
                  >
                    <Text style={[styles.modePillText, !joinExistingFamily && styles.modePillTextActive]}>
                      Start New Family
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modePill, joinExistingFamily && styles.modePillActive]}
                    onPress={() => setJoinExistingFamily(true)}
                  >
                    <Text style={[styles.modePillText, joinExistingFamily && styles.modePillTextActive]}>
                      Join as Co-Parent
                    </Text>
                  </TouchableOpacity>
                </View>

                {!joinExistingFamily ? (
                  <View style={styles.sectionBox}>
                    <Text style={styles.subHeader}>2. Linked Child Profile & SMS Setup (Required)</Text>
                    <Text style={styles.helperNote}>
                      Generates a 1-time invite code and direct access link that can be texted directly to your child's phone.
                    </Text>

                    <Text style={styles.label}>Child's Name *</Text>
                    <TextInput
                      placeholder="e.g., Sam"
                      placeholderTextColor={COLORS.textMuted}
                      value={childName}
                      onChangeText={setChildName}
                      style={styles.input}
                    />

                    <Text style={styles.label}>Child's Age * (3 - 18, tailors AI quizzes)</Text>
                    <TextInput
                      placeholder="e.g., 9"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numeric"
                      value={childAge}
                      onChangeText={setChildAge}
                      style={styles.input}
                    />

                    <Text style={styles.label}>Child's Phone Number * (for SMS app & profile link)</Text>
                    <TextInput
                      placeholder="e.g., (555) 987-6543"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="phone-pad"
                      value={childPhone}
                      onChangeText={setChildPhone}
                      style={styles.input}
                    />
                  </View>
                ) : (
                  <View style={styles.sectionBox}>
                    <Text style={styles.subHeader}>2. Join Existing Family (Co-Parent Code)</Text>
                    <Text style={styles.helperNote}>
                      Enter the 6-character Co-Parent Family Code from the other parent's Profiles tab to share access to all children, quizzes, and notifications.
                    </Text>

                    <Text style={styles.label}>Co-Parent Family Code *</Text>
                    <TextInput
                      placeholder="6-CHARACTER FAMILY CODE"
                      placeholderTextColor={COLORS.textMuted}
                      value={coParentCodeInput}
                      onChangeText={setCoParentCodeInput}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={6}
                      style={[styles.input, styles.codeInput]}
                    />
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryButton, styles.indigoButton]}
                  onPress={handleParentRegister}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonText}>
                    {joinExistingFamily
                      ? 'Create Account & Join Family Household'
                      : 'Create Account & Generate Child SMS Link'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.codeBox}>
                <Text style={styles.successTitle}>
                  {registeredResult.joinedExistingFamily
                    ? '🎉 Co-Parent Account Linked!'
                    : '🎉 Family & Child Link Ready!'}
                </Text>

                {registeredResult.joinedExistingFamily ? (
                  <Text style={styles.codeDescription}>
                    Welcome <Text style={styles.bold}>{registeredResult.parent.name}</Text>! You now share full Co-Parent access to your family household ({registeredResult.children?.length || 0} linked child profile(s)).
                  </Text>
                ) : (
                  <>
                    <Text style={styles.codeDescription}>
                      Parent <Text style={styles.bold}>{registeredResult.parent.name}</Text> ({registeredResult.parent.phoneNumber}) is linked to <Text style={styles.bold}>{registeredResult.child.name}</Text> ({registeredResult.child.phoneNumber}).
                    </Text>

                    <Text style={styles.codeLabel}>ONE-TIME CHILD INVITE CODE</Text>
                    <Text style={styles.codeText} selectable>{registeredResult.inviteCode}</Text>

                    <View style={styles.coParentMiniBox}>
                      <Text style={styles.coParentMiniLabel}>
                        CO-PARENT FAMILY CODE (Share with a 2nd parent/guardian):
                      </Text>
                      <Text style={styles.coParentMiniCode} selectable>
                        {registeredResult.coParentInviteCode}
                      </Text>
                    </View>

                    {smsStatusMessage ? (
                      <Text style={styles.smsSuccessBanner}>{smsStatusMessage}</Text>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.primaryButton, styles.skyButton, styles.fullWidthButton, styles.buttonSpacing]}
                      onPress={handleSendInviteSms}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.buttonText}>
                        📱 Text App Download & Access Link to {registeredResult.child.name}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.smsPreviewBox}>
                      <Text style={styles.smsPreviewHeader}>
                        SMS Message Preview (To: {registeredResult.child.phoneNumber}):
                      </Text>
                      <Text style={styles.smsPreviewText} selectable>
                        {buildChildInviteSmsMessage({
                          parentName: registeredResult.parent.name,
                          childName: registeredResult.child.name,
                          inviteCode: registeredResult.inviteCode
                        })}
                      </Text>
                      <Text style={styles.smsDirectLinkNote} selectable>
                        Direct Access URL: {buildChildAccessLinks(registeredResult.inviteCode).accessLink}
                      </Text>
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.primaryButton, styles.greenButton, styles.fullWidthButton]}
                  onPress={() => onLoginSuccess('parent', registeredResult.parent)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.buttonText}>Open Parent Dashboard →</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.secondaryButton, styles.backButton]}
              onPress={() => {
                setRegisteredResult(null);
                switchMode('select');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'child_login' && (
          <View style={styles.card}>
            <Text style={styles.header}>One-Time Child Login</Text>
            <Text style={styles.subtext}>
              Enter the 6-character one-time invite code texted by your parent, or tap the direct access link in your text message to stay permanently logged in!
            </Text>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Text style={styles.label}>One-Time Invite Code *</Text>
            <TextInput
              placeholder="6-CHARACTER CODE"
              placeholderTextColor={COLORS.textMuted}
              value={inviteCodeInput}
              onChangeText={setInviteCodeInput}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={handleChildLogin}
              style={[styles.input, styles.codeInput]}
            />

            <TouchableOpacity
              style={[styles.primaryButton, styles.greenButton]}
              onPress={handleChildLogin}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>Activate & Permanently Log In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, styles.backButton]}
              onPress={() => switchMode('select')}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: COLORS.background },
  flexOne: { flex: 1 },
  scrollContainer: { padding: 20, flexGrow: 1, justifyContent: 'center' },
  heroHeader: { alignItems: 'center', marginBottom: 24 },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE'
  },
  logoIcon: { fontSize: 32 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 4 },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    ...SHADOWS.card
  },
  permanentChildCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7'
  },
  badgePillGreen: {
    alignSelf: 'flex-start',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8
  },
  badgePillGreenText: { fontSize: 11, fontWeight: '800', color: COLORS.successDark },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  cardEmoji: { fontSize: 28 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  cardSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  cardDescription: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 20 },
  header: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 6 },
  subHeader: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: COLORS.primary },
  subtext: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 16, lineHeight: 20 },
  helperNote: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 12, lineHeight: 18 },
  familyModeToggleRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16
  },
  modePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center'
  },
  modePillActive: {
    backgroundColor: COLORS.primary
  },
  modePillText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  modePillTextActive: { color: '#FFFFFF' },
  sectionBox: {
    backgroundColor: COLORS.surfaceAlt,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16
  },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    borderRadius: 10,
    fontSize: 15
  },
  codeInput: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 4,
    color: COLORS.primary
  },
  primaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  outlineButton: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  outlineButtonText: { color: COLORS.primary, fontSize: 15, fontWeight: '700', textAlign: 'center' },
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
  fullWidthButton: { width: '100%' },
  indigoButton: { backgroundColor: COLORS.primary },
  skyButton: { backgroundColor: COLORS.secondary },
  greenButton: { backgroundColor: COLORS.success },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  buttonSpacing: { marginBottom: 10 },
  errorText: {
    backgroundColor: COLORS.dangerLight,
    color: COLORS.dangerDark,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    fontSize: 13,
    fontWeight: '600'
  },
  smsSuccessBanner: {
    backgroundColor: COLORS.successLight,
    color: COLORS.successDark,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%'
  },
  codeBox: {
    marginTop: 8,
    padding: 20,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center'
  },
  successTitle: { fontSize: 20, fontWeight: '800', color: COLORS.primaryDark, marginBottom: 8 },
  codeDescription: { fontSize: 14, textAlign: 'center', marginBottom: 14, color: COLORS.textPrimary, lineHeight: 20 },
  bold: { fontWeight: '700' },
  codeLabel: { fontSize: 12, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 1 },
  codeText: { fontSize: 34, fontWeight: '900', color: COLORS.primary, marginVertical: 8, letterSpacing: 3 },
  coParentMiniBox: {
    width: '100%',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#A5B4FC',
    alignItems: 'center',
    marginBottom: 12
  },
  coParentMiniLabel: { fontSize: 11, fontWeight: '700', color: COLORS.primaryDark, textAlign: 'center' },
  coParentMiniCode: { fontSize: 20, fontWeight: '900', color: COLORS.primary, marginTop: 4, letterSpacing: 2 },
  smsPreviewBox: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14
  },
  smsPreviewHeader: { fontSize: 12, fontWeight: '800', color: COLORS.textSecondary, marginBottom: 6 },
  smsPreviewText: { fontSize: 13, color: COLORS.textPrimary, lineHeight: 19 },
  smsDirectLinkNote: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginTop: 8 },
  linkButton: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
  linkText: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  backButton: { marginTop: 12 }
});
