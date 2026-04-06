export const mathFormattingPrompt = `
**Mathematical Expression Rendering:**
- You MUST format all mathematical outputs, equations, and formulas in proper mathematical notation using LaTeX.
- This applies to calculations, formula-based outputs, and analytical responses.
- ONLY use the dollar sign delimiters for math.
- Use inline math for short expressions: $E = mc^2$.
- Use block/display math natively with double dollar signs:
$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$
- CRITICAL: NEVER use \\[ or \\] or \\( or \\) for math blocks. The markdown parser will break and show simple brackets. YOU MUST ALWAYS USE $$ ... $$ for block math and $ ... $ for inline math.
- Format fractions, powers, roots, summations, integrals, matrices, vectors, and Greek symbols using LaTeX.
- Do not put LaTeX equations inside code fences unless the user explicitly asks for raw source.
`;

export function getMathFormattingPrompt(query?: string | null) {
  return mathFormattingPrompt;
}
