const mathQueryPatterns = [
  /\blatex\b/i,
  /\bequation\b/i,
  /\bformula\b/i,
  /\bderive\b/i,
  /\bderivative\b/i,
  /\bintegral\b/i,
  /\bmatrix\b/i,
  /\bquadratic\b/i,
  /\balgebra\b/i,
  /\bgeometry\b/i,
  /\btrigonometry\b/i,
  /\bcalculus\b/i,
  /\bprobability\b/i,
  /\bstatistics\b/i,
  /\banalytical?\b/i,
  /\banalysis\b/i,
  /\bsimplify\b/i,
  /\bsolve\b/i,
  /\bcalculate\b/i,
  /\bcalculation\b/i,
  /\bcompute\b/i,
];

export function isMathFormattingQuery(query?: string | null) {
  if (!query) {
    return false;
  }

  return mathQueryPatterns.some((pattern) => pattern.test(query));
}

export const mathFormattingPrompt = `
**Mathematical Expression Rendering:**
- When the user asks for calculations, formulas, proofs, derivations, or analytical explanations, format mathematical notation with LaTeX.
- Use inline math for short expressions, like $E = mc^2$.
- Use display math for standalone equations or final answers:
$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$
- Prefer LaTeX for fractions, powers, roots, summations, integrals, matrices, vectors, and Greek symbols.
- Keep explanatory prose outside the math delimiters.
- Do not put LaTeX equations inside code fences unless the user explicitly asks for raw source.
- For multi-step solutions, separate the reasoning into short steps and render the important equations in LaTeX.
- End technical solutions with a clearly labeled final expression or result when appropriate.
`;

export function getMathFormattingPrompt(query?: string | null) {
  return isMathFormattingQuery(query) ? mathFormattingPrompt : "";
}
