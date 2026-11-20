# Privacy Policy for PageQuest Reading Tracker

**Effective Date:** November 13, 2026  
**Application Name:** PageQuest Reading Tracker (`myapp.pagequest`)  
**Repository & Support:** https://github.com/ReaperX17/PageQuest

---

## 1. Overview
**PageQuest Reading Tracker** ("PageQuest", "we", "our", or "the App") is a family reading tracker and comprehension quiz application designed for parents/guardians and their children. We are committed to protecting the privacy of families and children who use PageQuest.

PageQuest does **not** display third-party advertisements, does **not** use behavioral tracking SDKs, and does **not** sell or rent personal information to third parties.

---

## 2. How Accounts & Child Profiles Work (Parental Control)
- **Parent-Created Accounts Only:** Only adults (18 years or older) can register an account in PageQuest.
- **Parent-Managed Child Profiles:** Parents create and manage child reader profiles within their family household and generate a one-time 6-character invite code (`inviteCode`) to link their child's device.
- **Co-Parent Household Access:** Parents may optionally share a 6-character Co-Parent Family Code with another parent or guardian in their household so both parents can view reading progress and approve reward milestones.

---

## 3. Information We Collect & Store
To provide reading tracking, AI comprehension quizzes, notifications, and family reward milestones, PageQuest stores the following information provided by the parent or child:

1. **Parent Account Information:**
   - Parent name, email address, phone number, age (18+), username, and password.
2. **Child Profile Information (Entered by Parent):**
   - Child's first name or display name, age (3–18), and optional phone number (used solely if the parent chooses to send an SMS invite or reading reminder from their device).
3. **Reading & Quiz Activity:**
   - Book titles, authors, page numbers read, reading duration, optional reading notes, comprehension quiz responses/scores, and family reward milestones.

---

## 4. How Information Is Used
We use the information stored in PageQuest strictly to:
- Track reading progress, daily reading goals, and reading streaks for your household.
- Generate age-appropriate 10-question reading comprehension quizzes based on the book title, author, page range, and reader age.
- Deliver in-app notifications and parent-initiated SMS reminders between parents and children within the same family household.
- Track custom parent-approved family rewards and milestones.

We **never** use parent or child data for targeted advertising, profiling, or marketing.

---

## 5. Data Storage & Third-Party Services
- **Local & Cloud Storage:** By default, family profiles, reading logs, and rewards are stored locally on your device using encrypted/sandboxed storage (`AsyncStorage`) and, when configured, synchronized across your family's devices via **Google Firebase (Authentication & Cloud Firestore)**.
- **AI Comprehension Quiz Generation:** When generating a comprehension quiz, only the **book title, author, page range, and reader age** (no personal names, emails, or phone numbers) are sent to the quiz generation service (Google Gemini API) to produce 10 multiple-choice comprehension questions.
- **SMS Invites & Reminders:** When a parent taps "Text App & Invite Link" or "Send + Text SMS", PageQuest opens the device's native SMS composer or uses the configured SMS webhook strictly to deliver the message to the phone number specified by the parent.

---

## 6. Data Retention & In-App Account Deletion
Parents have full control over their household data at all times:
- **In-App Account & Data Deletion:** Parents can permanently delete their account and all associated family data directly inside the app by opening **Parent Dashboard → Settings → Privacy & Data Management → Delete Account & Family Data**, and confirming **Yes, Permanently Delete All Data**.
- **What Happens Upon Deletion:** Deleting a family account immediately and permanently erases the parent login, all linked child profiles, book libraries, reading session histories, quiz results, notifications, and reward milestones.
- **External Deletion Requests:** Users may also request account or data deletion by opening an issue or contacting the maintainer via https://github.com/ReaperX17/PageQuest/issues.

---

## 7. Children's Privacy (COPPA & Store Family Policies)
PageQuest complies with applicable children's privacy laws, including the Children's Online Privacy Protection Act (COPPA):
- Child profiles can only be created by an authenticated parent or legal guardian (18+).
- Parents can review, edit, or permanently delete their child's profile, reading logs, and quiz history at any time from the **Parent Dashboard**.

---

## 8. Changes to This Privacy Policy
We may update this Privacy Policy from time to time. Any updates will be posted to https://github.com/ReaperX17/PageQuest/blob/main/PRIVACY_POLICY.md with an updated effective date.

---

## 9. Contact Us
If you have questions about this Privacy Policy or your family's data, please contact us via:
- **GitHub Repository:** https://github.com/ReaperX17/PageQuest
