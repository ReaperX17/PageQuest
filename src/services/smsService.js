import { Linking, Platform } from 'react-native';

export const APP_DOWNLOAD_URL = 'https://pagequest.app/download';

export function buildChildAccessLinks(inviteCode) {
  const cleanCode = String(inviteCode || '').trim().toUpperCase();
  const webOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://pagequest.app';

  return {
    downloadUrl: APP_DOWNLOAD_URL,
    accessLink: `${webOrigin}/?inviteCode=${encodeURIComponent(cleanCode)}`,
    deepLink: `pagequest://join?inviteCode=${encodeURIComponent(cleanCode)}`
  };
}

export function buildChildInviteSmsMessage({ parentName, childName, inviteCode }) {
  const { downloadUrl, accessLink } = buildChildAccessLinks(inviteCode);
  return (
    `Hi ${childName || 'there'}! ${parentName || 'Your parent'} set up your PageQuest Reading Tracker profile.\n\n` +
    `1. Download PageQuest: ${downloadUrl}\n` +
    `2. Tap for instant profile access: ${accessLink}\n` +
    `3. Or enter your 1-Time Invite Code: ${inviteCode}`
  );
}

export function buildCoParentInviteSmsMessage({ inviterName, invitingParentName, coParentInviteCode }) {
  const sender = inviterName || invitingParentName || 'Your co-parent';
  return (
    `Hi! ${sender} invited you to join your family's PageQuest Reading Tracker household.\n\n` +
    `1. Download PageQuest: ${APP_DOWNLOAD_URL}\n` +
    `2. Open "Create Parent Account", choose "Join as Co-Parent", and enter Co-Parent Code: ${coParentInviteCode}`
  );
}

export function buildReadingReminderSmsMessage({ childName, message }) {
  return `📚 PageQuest Reading Reminder for ${childName || 'you'}: ${message}`;
}

export async function openNativeSmsComposer(phoneNumber, messageBody) {
  const cleanDigits = String(phoneNumber || '').replace(/[^\d+]/g, '');
  if (!cleanDigits) {
    return { success: false, error: "Missing recipient phone number." };
  }

  const separator = Platform.OS === 'ios' ? '&' : '?';
  const smsUrl = `sms:${cleanDigits}${separator}body=${encodeURIComponent(messageBody)}`;

  try {
    await Linking.openURL(smsUrl);
    return { success: true, smsUrl, messageBody };
  } catch (error) {
    console.warn("Could not open native SMS app directly:", error.message);
    return {
      success: false,
      smsUrl,
      messageBody,
      error: "SMS app could not be opened automatically on this device, but the invite text and link are ready below."
    };
  }
}

export async function sendChildInviteViaSms({ phoneNumber, parentName, childName, inviteCode }) {
  const messageBody = buildChildInviteSmsMessage({ parentName, childName, inviteCode });
  return await openNativeSmsComposer(phoneNumber, messageBody);
}

export async function sendCoParentInviteViaSms({ phoneNumber, inviterName, invitingParentName, coParentInviteCode }) {
  const messageBody = buildCoParentInviteSmsMessage({ inviterName, invitingParentName, coParentInviteCode });
  return await openNativeSmsComposer(phoneNumber, messageBody);
}

export async function sendReadingReminderViaSms({ phoneNumber, childName, message }) {
  const messageBody = buildReadingReminderSmsMessage({ childName, message });
  return await openNativeSmsComposer(phoneNumber, messageBody);
}
