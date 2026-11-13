import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';

// Helper function to retry an async operation on transient errors
async function retryOperation(fn, retries = 2, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      const isAuthOrBadRequest =
        error?.status === 400 ||
        error?.status === 401 ||
        error?.status === 403 ||
        /API_KEY_INVALID|Missing EXPO_PUBLIC_GEMINI_API_KEY|400|401|403/i.test(error?.message || '');
      if (isAuthOrBadRequest || i === retries - 1) {
        throw error;
      }
      console.warn(`Gemini request failed (Attempt ${i + 1}/${retries}). Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Validate and normalize quiz questions so options and correctAnswer always match
function normalizeQuizData(parsed) {
  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error("Invalid quiz format returned.");
  }

  const normalizedQuestions = parsed.questions.slice(0, 10).map((q, idx) => {
    const options = Array.isArray(q.options) && q.options.length >= 2
      ? q.options.map((opt) => String(opt).trim())
      : ["Option A", "Option B", "Option C", "Option D"];
    let correctAnswer = String(q.correctAnswer || options[0]).trim();
    if (!options.includes(correctAnswer)) {
      const matched = options.find((opt) => opt.toLowerCase() === correctAnswer.toLowerCase());
      correctAnswer = matched || options[0];
    }
    return {
      prompt: String(q.prompt || `Question ${idx + 1}`).trim(),
      options,
      correctAnswer
    };
  });

  return { questions: normalizedQuestions };
}

// Hermes-safe mobile REST request with @google/genai fallback
async function requestGeminiJson(prompt) {
  if (!apiKey) {
    throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    })
  });

  if (res.ok) {
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      return normalizeQuizData(JSON.parse(text));
    }
  } else {
    const errText = await res.text();
    const err = new Error(`Gemini HTTP ${res.status}: ${errText}`);
    err.status = res.status;
    throw err;
  }

  // Fallback to @google/genai SDK
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json'
    }
  });
  return normalizeQuizData(JSON.parse(response.text));
}

// Built-in fallback generator so quizzes work even if offline or before a live Gemini key is configured
function buildFallbackQuiz({ childAge, bookTitle, author, startingPage, endingPage }) {
  const pageCount = Math.max(1, Number(endingPage) - Number(startingPage) + 1);
  const midPage = Math.floor((Number(startingPage) + Number(endingPage)) / 2);

  return {
    isFallback: true,
    questions: [
      {
        prompt: `What is the title of the book you read in this session?`,
        options: [
          bookTitle,
          "The Mystery of the Lost Key",
          "Adventures in Outer Space",
          "The Secret Gardeners"
        ],
        correctAnswer: bookTitle
      },
      {
        prompt: `Who is the author of "${bookTitle}"?`,
        options: [
          author,
          "J.R.R. Tolkien",
          "Beverly Cleary",
          "Roald Dahl"
        ],
        correctAnswer: author
      },
      {
        prompt: `Which page did you start reading from in "${bookTitle}" today?`,
        options: [
          `Page ${startingPage}`,
          `Page ${Number(startingPage) + 25}`,
          `Page ${Math.max(1, Number(startingPage) - 15)}`,
          `Page ${Number(endingPage) + 50}`
        ],
        correctAnswer: `Page ${startingPage}`
      },
      {
        prompt: `Which page did you finish reading on in "${bookTitle}" for this session?`,
        options: [
          `Page ${endingPage}`,
          `Page ${Number(endingPage) + 30}`,
          `Page ${Math.max(1, Number(startingPage) - 5)}`,
          `Page ${Number(endingPage) + 100}`
        ],
        correctAnswer: `Page ${endingPage}`
      },
      {
        prompt: `About how many pages of "${bookTitle}" did your reading range (pages ${startingPage} to ${endingPage}) cover?`,
        options: [
          `${pageCount} page(s)`,
          `${pageCount + 50} page(s)`,
          `${pageCount + 100} page(s)`,
          `500 page(s)`
        ],
        correctAnswer: `${pageCount} page(s)`
      },
      {
        prompt: `Which of these page numbers was part of your reading between page ${startingPage} and page ${endingPage}?`,
        options: [
          `Page ${midPage}`,
          `Page ${Number(endingPage) + 15}`,
          `Page ${Number(endingPage) + 40}`,
          `Page ${Number(endingPage) + 75}`
        ],
        correctAnswer: `Page ${midPage}`
      },
      {
        prompt: `When reading "${bookTitle}" from page ${startingPage} to ${endingPage}, what is the best way to understand the main character's choices?`,
        options: [
          "Pay attention to what the character says, does, and feels in these pages",
          "Skip every other page without reading",
          "Only read the page numbers at the bottom",
          "Close the book before finishing the sentence"
        ],
        correctAnswer: "Pay attention to what the character says, does, and feels in these pages"
      },
      {
        prompt: `If you come across an unfamiliar word on page ${midPage} of "${bookTitle}", what is the best reading strategy?`,
        options: [
          "Use context clues from the surrounding sentences or ask a parent/dictionary",
          "Stop reading the book forever",
          "Tear out the page",
          "Pretend the page is blank"
        ],
        correctAnswer: "Use context clues from the surrounding sentences or ask a parent/dictionary"
      },
      {
        prompt: `How does ${author} help the reader picture the setting in pages ${startingPage}-${endingPage} of "${bookTitle}"?`,
        options: [
          "By using descriptive details about where and when the events happen",
          "By leaving all the pages completely empty",
          "By writing only numbers instead of words",
          "By hiding the book title"
        ],
        correctAnswer: "By using descriptive details about where and when the events happen"
      },
      {
        prompt: `After finishing up to page ${endingPage} of "${bookTitle}", what score is needed on this quiz to advance to the next pages?`,
        options: [
          "90% or higher (at least 9 out of 10 correct)",
          "10% (1 out of 10 correct)",
          "20% (2 out of 10 correct)",
          "0% (0 out of 10 correct)"
        ],
        correctAnswer: "90% or higher (at least 9 out of 10 correct)"
      }
    ]
  };
}

export async function generateComprehensionQuiz({ childAge, bookTitle, author, startingPage, endingPage }) {
  const prompt = `
    Generate a 10-question reading comprehension quiz for a ${childAge}-year-old child who just read "${bookTitle}" by ${author} from page ${startingPage} to page ${endingPage}.
    
    Return the response ONLY as a valid JSON object with the following structure, with no markdown code block formatting or extra text outside the JSON:
    {
      "questions": [
        {
          "prompt": "Question text here?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "Option A"
        }
      ]
    }
    Ensure there are exactly 10 questions appropriate for a ${childAge}-year-old reader, and each correctAnswer exactly matches one of the 4 options.
  `;

  try {
    const quizData = await retryOperation(async () => {
      return await requestGeminiJson(prompt);
    });
    return quizData;
  } catch (error) {
    console.warn("Gemini API unavailable or key invalid; using built-in comprehension quiz fallback:", error.message);
    return buildFallbackQuiz({ childAge, bookTitle, author, startingPage, endingPage });
  }
}

export function evaluateQuizScore(userAnswers, quizData) {
  const questions = quizData?.questions || [];
  let correctCount = 0;

  const breakdown = questions.map((q, index) => {
    const selectedAnswer = userAnswers[index] || null;
    const isCorrect = selectedAnswer === q.correctAnswer;
    if (isCorrect) {
      correctCount++;
    }
    return {
      questionNumber: index + 1,
      prompt: q.prompt,
      selectedAnswer,
      correctAnswer: q.correctAnswer,
      isCorrect
    };
  });

  const totalQuestions = questions.length;
  const scorePercentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const passed = scorePercentage >= 90; // Strict 90% threshold (9/10 required)

  return {
    correctCount,
    totalQuestions,
    scorePercentage,
    passed,
    breakdown
  };
}
