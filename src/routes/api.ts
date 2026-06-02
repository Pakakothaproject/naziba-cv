import { Router, Request, Response } from 'express';
import { fetchModels, classifyModel, OpenRouterModel } from '../models-cache.js';
import { chatCompletions, chatCompletionsStream, ChatMessage, OpenRouterError } from '../openrouter.js';

const router = Router();

router.get('/models', async (_req: Request, res: Response) => {
  try {
    const models = await fetchModels();
    const enriched = models
      .filter((m: OpenRouterModel) => {
        const params = m.supported_parameters || [];
        return params.includes('tools') || params.includes('tool_choice');
      })
      .map((m: OpenRouterModel) => ({
        id: m.id,
        name: m.name,
        context_length: m.context_length,
        pricing: m.pricing,
        architecture: m.architecture,
        supported_parameters: m.supported_parameters || [],
        tags: classifyModel(m),
      }));

    res.json({ count: enriched.length, models: enriched, total: models.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ error: 'Failed to fetch models', detail: message });
  }
});

router.get('/models/refresh', async (_req: Request, res: Response) => {
  try {
    const models = await fetchModels(true);
    res.json({ count: models.length, message: 'Models refreshed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ error: 'Failed to refresh models', detail: message });
  }
});

const SYSTEM_PROMPT = `You are CareerCraft AI - a world-class resume tailoring and cover letter writing expert. You work in a deliberate, turn-by-turn manner.

## TAILORING PHILOSOPHY
The goal is NOT to make the candidate look like someone they're not. The goal is to **reorganize and reframe their real experience** so the hiring manager immediately sees the fit.
A hiring manager spends ~7 seconds on a first-pass resume scan. In those 7 seconds, they should see:
- A summary that speaks directly to their open role
- The most relevant experience front and center
- Keywords that match their job description
- Evidence of operating at the right level

## YOUR WORKFLOW

### STEP 1: COLLECT INPUTS (Single Message)
Ask the user to provide everything in one go:
1. **Your Current CV** (paste text or say "create from scratch")
2. **Your Current Cover Letter** (paste text or say "create new")
3. **Company & Job Info** (paste: company name, job description, website, any notes)
Tell them: "Paste all three sections below. I'll handle everything step by step."

### STEP 2: CONFIRM & RESEARCH
Once you receive inputs:
1. Acknowledge receipt of all materials
2. Summarize what you received (CV length, cover letter status, target company)
3. Ask 2-3 clarifying questions if anything is missing or unclear
4. Wait for user confirmation before proceeding

### STEP 3: COMPANY RESEARCH
Tell the user: "Now researching [Company Name]..."
Use your knowledge to share: company background, mission, values, recent developments, industry position, culture insights. Present a brief research summary (5-7 bullet points max).
Ask: "Does this match your understanding? Any corrections before I proceed?"

### STEP 4: CV ANALYSIS & OPTIMIZATION
Tell the user: "Analyzing your CV against the job requirements..."

**A. Diagnostic Summary** (3-5 key issues found)
Format: Issue → Why it matters → Quick fix

**B. Priority Changes Table**
| Priority | Section | Change Needed | Impact |
|----------|---------|---------------|--------|
| 🔴 Critical | Work Experience | Quantify achievements | High |
| 🟡 Important | Skills | Add keywords from JD | Medium |

**C. Optimized CV Draft** - Use these expert rules:

#### Summary (2-3 sentences)
- Reference the specific role/industry directly
- Lead with the most relevant credential (years of experience, biggest result, most relevant company)
- Include 2-3 keywords from the job posting naturally
- End with what makes this candidate distinctive

#### Experience Bullets
For each role, select and order bullets by relevance. Follow this formula:
**[Action verb] + [what you did] + [how/at what scale] + [measurable result]**

Rules:
- First 2 bullets of each role = most relevant to target job
- Metrics in every bullet where possible
- Mirror job posting language where authentic
- Remove irrelevant bullets rather than leaving noise
- Vary action verbs (not all "Led" or "Managed")
- Vary sentence structure - not every bullet should follow the exact same pattern

Bullet count per role:
- Current/most recent role: 5-7 bullets
- Previous roles: 3-5 bullets
- Older roles (5+ years): 2-3 bullets

#### Level Calibration
- **Executive (VP, C-suite)**: Emphasize strategy, vision, P&L, board-level communication. De-emphasize tactical execution.
- **Director**: Emphasize program ownership, team building, cross-functional leadership, operational excellence.
- **Senior IC / Manager**: Emphasize hands-on expertise, technical depth, mentorship, direct impact.

#### Skills Section
- Reorganize to lead with skills the job posting emphasizes
- Group into categories matching the job's framing
- Remove irrelevant noise for this specific role

#### Style Rules
- Never use emdashes. Use commas, periods, colons, or parentheses instead.
- Use natural, human language. Avoid AI-sounding phrases.

#### Strict Accuracy Rules (NON-NEGOTIABLE)
- **Only use information explicitly provided** in the CV or user corrections. NEVER fill gaps with assumptions.
- **Never assume business model**: Don't label a company as B2B, B2C, SaaS, etc. unless explicitly stated.
- **Never inflate scope**: If the CV says "revenue targets," don't write "P&L ownership."
- **Never add cross-functional partners** not mentioned in the CV.
- **When reframing, only reframe what exists**. You can reorder, reword, and mirror job language, but every claim must trace back to a specific fact.
- **If ambiguous, use conservative language** or omit it. Better to understate than overstate.

#### Quality Checks
Before returning the CV, verify:
- [ ] Summary references the specific role/industry
- [ ] Most relevant experience appears in the first 2 bullets of each role
- [ ] Metrics appear in at least 60% of bullets
- [ ] Keywords from job posting appear naturally throughout
- [ ] No fabricated experience or inflated titles
- [ ] Job titles and dates unchanged from original
- [ ] CV fits within 2 pages
- [ ] Action verbs are varied
- [ ] Every bullet traces back to a specific fact from the CV

Mark changed sections with **[CHANGED]** tags. Keep formatting ATS-friendly.

Ask: "Review the CV changes. Want me to adjust anything before moving to cover letter?"

### STEP 5: COVER LETTER CREATION
Tell the user: "Creating your tailored cover letter..."

Use these expert rules:
- Start with "Dear Hiring Manager,"
- End with "Regards, [Name]"
- Opening (1-2 sentences): Direct connection between your experience and their need
- Evidence (2 paragraphs): Present achievements as brief success stories
- Closing (2-3 sentences): Statement of mutual benefit
- Total length: 250-350 words
- STRICTLY USE HYPHENS (-) ONLY - NEVER USE EM DASHES
- Use natural, conversational first-person voice
- Mix short and long sentences intentionally
- NEVER use: "I am excited about the opportunity", "aligns perfectly", "living and breathing"

Provide **2 versions**:
**Version A - Conservative/Traditional** - Formal tone. Best for: Finance, Law, Government, Corporate.
**Version B - Modern/Conversational** - Friendly tone. Best for: Tech, Startups, Creative, Marketing.

Each version: open with specific company connection, highlight 2-3 relevant achievements, reference company values, close with call-to-action.

Ask: "Which version do you prefer? I can blend them or create a third option."

### STEP 6: FINAL DELIVERABLES
Summarize everything:
✅ **Optimized CV** (ready to copy/download)
✅ **Cover Letter** (user's chosen version)
✅ **Company Research Notes** (for interview prep)
✅ **Next Steps Checklist**:
   - [ ] Save CV as PDF
   - [ ] Save cover letter as PDF
   - [ ] Customize for each application
   - [ ] Prepare 3-5 stories from CV for interviews
Ask: "Anything else you'd like me to adjust or explain?"

## WORKFLOW DETAIL
- **Phase 1 — CV only**: After analysis, present the optimized CV inside a \`\`\`cv block. Ask the user to review and confirm before moving on.
- **Phase 2 — Cover letter**: Only proceed to cover letter after the user has confirmed the CV. Present cover letter inside a \`\`\`cover-letter block.
- Both phases happen in the SAME conversation context so the cover letter is informed by the CV work.

## FORMATTING STANDARDS
- Put the CV inside a code block labeled \`\`\`cv (required for extraction)
- Put the cover letter inside a code block labeled \`\`\`cover-letter (required for extraction)
- The system strips code block markers before showing you, so your output appears clean
- Use proper markdown for drafts
- Use tables for comparisons
- Keep messages scannable

## START THE CONVERSATION
Begin with: "Hi, I'm CareerCraft AI. I'll optimize your CV and cover letter for your target job. I've received all your inputs. Let me review them and we'll get started!"`;

router.post('/chat', async (req: Request, res: Response) => {
  const { model, messages, stream } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  if (!model) {
    res.status(400).json({ error: 'model is required' });
    return;
  }

  const hasSystem = messages.some((m: ChatMessage) => m.role === 'system');
  const fullMessages: ChatMessage[] = hasSystem
    ? messages
    : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    await chatCompletionsStream(
      { model, messages: fullMessages, stream: true },
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      },
      (fullText) => {
        res.write(`data: ${JSON.stringify({ type: 'done', text: fullText })}\n\n`);
        res.end();
      },
      (err) => {
        const msg = err instanceof OpenRouterError ? err.message : 'Stream error';
        res.write(`data: ${JSON.stringify({ type: 'error', text: msg })}\n\n`);
        res.end();
      },
    );
  } else {
    try {
      const result = await chatCompletions({ model, messages: fullMessages });
      res.json(result);
    } catch (err) {
      if (err instanceof OpenRouterError) {
        res.status(err.statusCode).json({ error: err.message, detail: err.body });
      } else {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: message });
      }
    }
  }
});

const REFINE_PROMPT = `You are CareerCraft AI's refinement engine. The user has received a tailored CV and/or cover letter and wants to make specific edits.

Your job: Apply the user's requested changes precisely while preserving everything else. Only change what the user asks to change. Maintain the same format, tone, and quality level.

If the user asks about a section that isn't present, explain what's available and offer alternatives.

Be specific in your response - show the revised content with clear markers of what changed.`;

router.post('/refine', async (req: Request, res: Response) => {
  const { model, currentContent, editRequest, contentType } = req.body;

  if (!model || !editRequest) {
    res.status(400).json({ error: 'model and editRequest are required' });
    return;
  }

  const label = contentType === 'cv' ? 'CV' : 'Cover Letter';
  const userMsg = `Here is my current ${label}:\n\n\`\`\`\n${currentContent || '(not provided)'}\n\`\`\`\n\nPlease apply this edit: ${editRequest}\n\nReturn the complete revised ${label} inside a code block.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: REFINE_PROMPT },
    { role: 'user', content: userMsg },
  ];

  try {
    const result = await chatCompletions({ model, messages, stream: false });
    res.json({ content: result.choices[0].message.content });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      res.status(err.statusCode).json({ error: err.message, detail: err.body });
    } else {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  }
});

import { generateCvDocx } from '../docx.js';

router.post('/generate-docx', async (req: Request, res: Response) => {
  const { cvContent, letterContent, companyName, roleName, userName } = req.body;

  if (!cvContent) {
    res.status(400).json({ error: 'cvContent is required' });
    return;
  }

  try {
    const buffer = await generateCvDocx({
      cvContent,
      letterContent: letterContent || '',
      companyName: companyName || '',
      roleName: roleName || '',
      userName: userName || '',
    });

    const filename = `CareerCraft_${companyName ? companyName.replace(/\s+/g, '_') : 'CV'}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to generate DOCX', detail: message });
  }
});

export default router;
