const cachedScores = {};
function _getPreviousPronScore(t) { return cachedScores[t] || null; }
function _rememberPronScore(t, s) { cachedScores[t] = s; }
// _clampRange not found

// _getMatchedWordStats not found

// _getSimilarity not found

// _finalScoreGuard not found

// _applyMatchedWordScoreGuard not found

// _getPronScoreKey not found

// _getPronunciationReason not found

// _scorePronunciationMetrics not found

// _scorePronunciationForReference not found

// _finalizePronunciationScore not found

// _getSimilarityPenalty not found

// _applySimilarityPenalty not found


const reference = "у меня есть";
const scenarios = [
    { name: "Garbage", text: "привет пока" },
    { name: "Weak Partial", text: "у меня" },
    { name: "Stronger", text: "у меня есть слово" },
    { name: "Correct", text: "у меня есть" },
    { name: "One-char interim", text: "я" }
];

console.log("Scenario | Similarity | Penalty | Final Score");
console.log("--- | --- | --- | ---");

scenarios.forEach(s => {
    const similarity = _getSimilarity(s.text, reference);
    const baseScore = _scorePronunciationForReference(reference, similarity, 70, 70, 70);
    const penalty = _getSimilarityPenalty(similarity);
    const penalizedScore = _applySimilarityPenalty(baseScore, penalty);
    const finalScore = _finalizePronunciationScore(reference, penalizedScore, similarity, s.text, 70, 70);
    
    let note = "";
    if (s.name === "One-char interim") {
       const isCleared = s.text.length < 2;
       note = isCleared ? " (Cleared because length < 2)" : "";
    }

    console.log(s.name + " | " + similarity.toFixed(2) + " | " + penalty.toFixed(2) + " | " + finalScore + note);
});
