import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { evaluateQuizScore } from '../services/quizService';
import { COLORS, SHADOWS } from '../theme';

export default function ChildQuizScreen({ quizData, sessionInfo, onQuizCompleted }) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const questions = quizData?.questions || [];
  const currentQuestion = questions[currentQuestionIndex];
  const progressPercent = questions.length > 0
    ? Math.round(((currentQuestionIndex + 1) / questions.length) * 100)
    : 0;

  const handleSelectOption = (option) => {
    setErrorMessage('');
    setUserAnswers({
      ...userAnswers,
      [currentQuestionIndex]: option
    });
  };

  const handlePrevious = () => {
    setErrorMessage('');
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleNext = () => {
    if (!userAnswers[currentQuestionIndex]) {
      const msg = "Please select an answer before moving forward.";
      setErrorMessage(msg);
      Alert.alert("Selection Required", msg);
      return;
    }

    setErrorMessage('');
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      const result = evaluateQuizScore(userAnswers, quizData);
      setQuizResult(result);
    }
  };

  if (quizResult) {
    return (
      <ScrollView contentContainerStyle={styles.resultsContainer}>
        <View style={[styles.feedbackCard, quizResult.passed ? styles.passCard : styles.failCard]}>
          <Text style={styles.resultEmoji}>{quizResult.passed ? "🏆" : "📖"}</Text>
          <Text style={[styles.statusText, quizResult.passed ? styles.passText : styles.failText]}>
            {quizResult.passed ? "QUIZ PASSED!" : "KEEP READING & TRY AGAIN"}
          </Text>
          <Text style={styles.scoreText}>
            {quizResult.scorePercentage}% ({quizResult.correctCount} / {quizResult.totalQuestions} Correct)
          </Text>
          <Text style={styles.feedbackDescription}>
            {quizResult.passed
              ? "Awesome job! You scored 90% or higher and unlocked the next pages of your book."
              : "You need at least 90% (9/10) to pass. Review the questions you missed below, re-read those pages, and try again!"}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, quizResult.passed ? styles.greenButton : styles.indigoButton, styles.finishButton]}
          onPress={() => onQuizCompleted(quizResult)}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            {quizResult.passed ? "Save Result & Continue Reading →" : "Return to Book & Review Pages"}
          </Text>
        </TouchableOpacity>

        {Array.isArray(quizResult.breakdown) && quizResult.breakdown.length > 0 && (
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownHeader}>Question-by-Question Review</Text>
            {quizResult.breakdown.map((item) => (
              <View
                key={item.questionNumber}
                style={[styles.breakdownCard, item.isCorrect ? styles.correctItem : styles.missedItem]}
              >
                <Text style={styles.breakdownQuestion}>
                  {item.questionNumber}. {item.prompt}
                </Text>
                <Text style={styles.breakdownAnswer}>
                  Your Answer: <Text style={styles.bold}>{item.selectedAnswer}</Text>
                </Text>
                <Text style={[styles.breakdownBadge, item.isCorrect ? styles.passText : styles.failText]}>
                  {item.isCorrect ? "✓ Correct" : "✗ Missed — Check your book pages for this detail"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  if (!currentQuestion) {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>Loading Quiz...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {sessionInfo?.bookTitle && (
        <View style={styles.bookContextPill}>
          <Text style={styles.bookContextText} numberOfLines={1}>
            📖 {sessionInfo.bookTitle} (Pages {sessionInfo.startingPage}–{sessionInfo.endingPage})
          </Text>
        </View>
      )}

      <View style={styles.quizCard}>
        <View style={styles.progressHeaderRow}>
          <Text style={styles.progress}>Question {currentQuestionIndex + 1} of {questions.length}</Text>
          <Text style={styles.progressPercent}>{progressPercent}%</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>

        <Text style={styles.prompt}>{currentQuestion.prompt}</Text>

        {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

        {currentQuestion.options.map((option, index) => {
          const isSelected = userAnswers[currentQuestionIndex] === option;
          const optionLabels = ['A', 'B', 'C', 'D'];
          return (
            <TouchableOpacity
              key={index}
              style={[styles.optionButton, isSelected && styles.selectedOption]}
              onPress={() => handleSelectOption(option)}
              activeOpacity={0.75}
            >
              <View style={[styles.optionCircle, isSelected && styles.selectedOptionCircle]}>
                <Text style={[styles.optionCircleText, isSelected && styles.selectedOptionCircleText]}>
                  {optionLabels[index] || index + 1}
                </Text>
              </View>
              <Text style={[styles.optionText, isSelected && styles.selectedOptionText]}>{option}</Text>
            </TouchableOpacity>
          );
        })}

        <View style={styles.navButtonsRow}>
          {currentQuestionIndex > 0 && (
            <TouchableOpacity
              style={[styles.primaryButton, styles.grayButton, styles.halfButton]}
              onPress={handlePrevious}
              activeOpacity={0.85}
            >
              <Text style={styles.grayButtonText}>← Previous</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              currentQuestionIndex === questions.length - 1 ? styles.greenButton : styles.indigoButton,
              currentQuestionIndex > 0 ? styles.halfButton : styles.fullButton
            ]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>
              {currentQuestionIndex === questions.length - 1 ? "Submit Quiz ✓" : "Next Question →"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, flexGrow: 1, justifyContent: 'center', backgroundColor: COLORS.background },
  resultsContainer: { padding: 18, flexGrow: 1, backgroundColor: COLORS.background },
  bookContextPill: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#C7D2FE'
  },
  bookContextText: { fontSize: 13, fontWeight: '700', color: COLORS.primaryDark },
  quizCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card
  },
  progressHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progress: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '700', textTransform: 'uppercase' },
  progressPercent: { fontSize: 13, color: COLORS.primary, fontWeight: '800' },
  progressBarBg: {
    height: 8,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 999
  },
  header: { fontSize: 24, fontWeight: '800', marginBottom: 16, textAlign: 'center', color: COLORS.textPrimary },
  prompt: { fontSize: 18, fontWeight: '700', marginBottom: 20, lineHeight: 26, color: COLORS.textPrimary },
  errorBanner: {
    backgroundColor: COLORS.dangerLight,
    color: COLORS.dangerDark,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600'
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12
  },
  selectedOption: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  optionCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  selectedOptionCircle: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  optionCircleText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
  selectedOptionCircleText: { color: '#FFFFFF' },
  optionText: { flex: 1, fontSize: 15, color: COLORS.textPrimary, lineHeight: 21 },
  selectedOptionText: { color: COLORS.primaryDark, fontWeight: '700' },
  navButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10
  },
  primaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  fullButton: { flex: 1 },
  halfButton: { flex: 1 },
  indigoButton: { backgroundColor: COLORS.primary },
  greenButton: { backgroundColor: COLORS.success },
  grayButton: { backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  grayButtonText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  resultEmoji: { fontSize: 40, marginBottom: 8 },
  scoreText: { fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center', color: COLORS.textPrimary },
  feedbackCard: { padding: 22, borderRadius: 16, borderWidth: 1.5, marginBottom: 16, alignItems: 'center', ...SHADOWS.card },
  passCard: { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' },
  failCard: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  statusText: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  passText: { color: COLORS.successDark },
  failText: { color: COLORS.dangerDark },
  feedbackDescription: { fontSize: 14, textAlign: 'center', color: COLORS.textSecondary, lineHeight: 21 },
  finishButton: { marginBottom: 20 },
  breakdownSection: { marginTop: 4 },
  breakdownHeader: { fontSize: 17, fontWeight: '800', marginBottom: 12, color: COLORS.textPrimary },
  breakdownCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10
  },
  correctItem: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  missedItem: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  breakdownQuestion: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 4 },
  breakdownAnswer: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  breakdownBadge: { fontSize: 13, fontWeight: '700' },
  bold: { fontWeight: '700' }
});
