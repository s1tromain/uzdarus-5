import fs from "fs";
const content = fs.readFileSync("paid-courses/speech.js", "utf8").replace(/\r\n/g, "\n");

function extractFunction(name) {
    const startRegex = new RegExp("function " + name + "\\\\(");
    const match = startRegex.exec(content);
    if (!match) return "// " + name + " not found";
    let start = match.index;
    let braceCount = 0;
    let end = -1;
    let foundStartBrace = false;
    for (let i = start; i < content.length; i++) {
        if (content[i] === "{") {
          braceCount++;
          foundStartBrace = true;
        }
        if (content[i] === "}") {
            braceCount--;
            if (braceCount === 0 && foundStartBrace) {
                end = i + 1;
                break;
            }
        }
    }
    return content.substring(start, end);
}

const functionNames = [
    "_clampRange", "_getMatchedWordStats", "_getSimilarity", "_finalScoreGuard",
    "_applyMatchedWordScoreGuard", "_getPronScoreKey", "_getPreviousPronScore",
    "_rememberPronScore", "_getPronunciationReason", "_scorePronunciationMetrics",
    "_scorePronunciationForReference", "_finalizePronunciationScore",
    "_getSimilarityPenalty", "_applySimilarityPenalty"
];

let extracted = "const cachedScores = {};\n";
extracted += "function _getPreviousPronScore(t) { return cachedScores[t] || null; }\n";
extracted += "function _rememberPronScore(t, s) { cachedScores[t] = s; }\n";

functionNames.forEach(name => {
    if (name !== "_getPreviousPronScore" && name !== "_rememberPronScore") {
        extracted += extractFunction(name) + "\n\n";
    }
});

extracted += `
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
`;

fs.writeFileSync("validation_test.js", extracted);

