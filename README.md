# 📚 PageQuest — Family Reading Tracker & AI Comprehension Quizzes

PageQuest is a cross-platform mobile and web reading tracker built with **Expo (React Native + Web)** and **Google Gemini AI**. It links parent/co-parent accounts with child reader profiles to track live reading progress, generate age-tailored 10-question reading comprehension quizzes, and motivate young readers with streaks and custom family rewards.

## ✨ Key Features

- **Multi-Parent & Co-Parent Household Access**:
  - Parents register with Full Name, Email, Phone Number, Age (18+), Username, and Password.
  - Each family household receives a **6-Character Co-Parent Family Code** so a second parent or guardian can join the same household and share live access to all children, quizzes, notifications, and settings.
- **One-Time Child Invite Code & Direct SMS Access Links**:
  - Parents set up child profiles (Name, Age 3–18, Phone Number) and can text an app download link + instant profile access link (`?inviteCode=XXXXXX`) or a 6-character one-time invite code that permanently logs the child in on their device.
- **Scoped Child Experience (Maximum 3 Tabs)**:
  - **📚 Library**: Start/switch books, update current page progress, track live reading time (`⏱️ Timer`), jot down a *"New Word or Favorite Moment"* note, and activate quizzes.
  - **🏆 Quiz Results**: View quiz scores, inspect question-by-question breakdowns, track progress across multiple **Family Reward Milestones**, and **request new custom rewards** from parents.
  - **🕒 History**: Timeline of completed reading sessions, page ranges, minutes read, and reading notes.
- **Parent / Co-Parent Hub (5 Tabs)**:
  - **📚 Library**: Live child reading status, `🔥 Day Streak`, daily page goal progress bar, total minutes read, and book recommendations.
  - **🏆 Quizzes**: Complete quiz results and expandable question-by-question answer breakdowns.
  - **🕒 History**: Real-time parent notifications (reading started, page updates, quiz scores, reward requests) and session timeline.
  - **👨‍👩‍👧 Profiles**: Co-parent household management, **Multi-Reward & Milestone Manager** (add/edit/delete/claim rewards and **Approve or Deny** child reward requests), reading reminders (in-app + SMS), and child profile management.
  - **⚙️ Settings**: Parent account profile & credentials and family notification/reminder preferences.
- **AI Comprehension Quizzes (`gemini-2.5-flash` + Offline Fallback)**:
  - Generates 10 multiple-choice questions tailored to the child's age and exact page range read.
  - Requires a **90% (9/10)** score to pass and advance the starting page bookmark.

## 🚀 Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Set `EXPO_PUBLIC_GEMINI_API_KEY` in `.env` (or use the built-in 10-question comprehension fallback generator).
3. **Run the app**:
   ```bash
   npx expo start
   ```
   - Press `w` to open in a web browser (`http://localhost:8081`).
   - Scan the QR code with **Expo Go** on iOS or Android.
