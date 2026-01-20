# Riley Recruiter - User Manual

## Your AI Recruiting Assistant That Works While You Sleep

---

## What is Riley?

Riley is an AI recruiting assistant that handles the repetitive parts of recruiting—sourcing candidates, sending outreach messages, scheduling interviews—while you maintain control over important decisions.

**Think of Riley like a junior recruiter who:**
- Works 24/7 without breaks
- Never forgets to follow up
- Always follows your company's guidelines
- But still checks with you before doing anything sensitive

---

## The Two-Loop System (How Riley Thinks)

```
┌─────────────────────────────────────────┐
│           YOU (Teleoperator)            │
│  • Review Riley's drafts                │
│  • Approve or edit messages             │
│  • Update guidelines when needed        │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│              RILEY (AI)                 │
│  • Sources candidates                   │
│  • Drafts personalized messages         │
│  • Schedules interviews                 │
│  • Learns from your feedback            │
└─────────────────────────────────────────┘
```

**Key Principle:** Riley proposes, you approve. Riley learns from every approval and rejection to get better over time.

---

## Getting Started (5 Minutes)

### Step 1: Access the Dashboard
Open your browser and go to: **http://localhost:3002**

### Step 2: Check Your Queue
Click **"Queue"** in the sidebar. This shows everything Riley wants to do and needs your approval.

### Step 3: Review Your First Task
Click on any pending task to see:
- What Riley wants to do
- The draft message or action
- Why Riley thinks this is appropriate

### Step 4: Approve, Edit, or Reject
- **Approve** ✓ - Riley executes the action
- **Edit & Approve** ✏️ - Make changes, then approve
- **Reject** ✗ - Riley learns what not to do

That's it! You're now using Riley.

---

## Daily Workflow

### Morning (5-10 minutes)
1. Open the **Queue** page
2. Review overnight tasks Riley drafted
3. Batch approve routine follow-ups
4. Edit any messages that need a personal touch

### Throughout the Day
- Riley sends you Slack/email alerts for urgent items
- Approve high-priority tasks as they come in
- Check the **Analytics** page to see performance

### Weekly (15 minutes)
1. Review the **Analytics** dashboard
2. Check response rates and adjust if needed
3. Update **Guidelines** if you notice patterns

---

## Core Features

### 1. Approval Queue (`/queue`)

Your command center for reviewing Riley's work.

| Status | Meaning |
|--------|---------|
| 🟡 Pending | Waiting for your review |
| ✅ Approved | You approved, Riley executed |
| ❌ Rejected | You rejected, Riley learned |
| ⏰ Expired | Sat too long, auto-cancelled |

**Pro Tips:**
- Use "Batch Approve" for routine follow-ups
- Sort by priority to handle urgent items first
- Click "View Diff" to see what changed from templates

### 2. Guidelines (`/guidelines`)

Tell Riley *how* to recruit for your company.

**What you can customize:**
- **Workflows** - Steps for sourcing, outreach, screening
- **Templates** - Email and LinkedIn message templates
- **Constraints** - Rate limits, approval rules

**Example:** If Riley's messages sound too formal, edit the "Brand Voice" section to be more casual.

### 3. Criteria (`/criteria`)

Tell Riley what *good* looks like.

**What you can set:**
- **Quality Standards** - Minimum scores for candidate fit
- **Success Metrics** - Target response rates
- **Red Flags** - Patterns to avoid

**Example:** Set minimum 3 years experience for senior roles.

### 4. Analytics (`/analytics`)

See how Riley (and your team) are performing.

**Key Metrics:**
- Response Rate - Are candidates replying?
- Time to Response - How fast is Riley?
- Approval Rate - How often do you approve Riley's work?
- Guidelines Evolution - How much has Riley learned?

### 5. Team (`/team`)

Manage who can use Riley.

**Roles:**
- **Admin** - Full access, can change settings
- **Teleoperator** - Can approve/reject tasks
- **Viewer** - Read-only access

### 6. Settings (`/settings`)

Configure Riley's behavior.

**Important Settings:**
- **Autonomy Level** - How independent Riley can be
- **Notifications** - When to alert you
- **Integrations** - Connect ATS, email, calendar

---

## Autonomy Levels

Riley has three operating modes:

| Level | What Riley Can Do | Best For |
|-------|-------------------|----------|
| **Shadow** | Watch and learn only | First week |
| **Supervised** | Draft everything, you approve all | Weeks 2-4 |
| **Autonomous** | Handle routine tasks, escalate sensitive ones | After trust is built |

**Progression:**
```
Shadow → Supervised → Autonomous
  ↑                        |
  └── (If problems occur) ←┘
```

Riley automatically suggests promotion when metrics are good. You can also demote Riley if quality drops.

---

## Common Tasks

### Approve a Message
1. Go to Queue
2. Click the task
3. Read the draft
4. Click "Approve" (or edit first)

### Edit Riley's Template
1. Go to Guidelines
2. Find the template
3. Click "Edit"
4. Update the text
5. Save

### Change Autonomy Level
1. Go to Settings
2. Click "Autonomy"
3. Select new level
4. Save Changes

### Invite a Team Member
1. Go to Team
2. Click "Invite Member"
3. Enter email and role
4. Send invitation

### Connect an Integration
1. Go to Settings
2. Click "Integrations"
3. Click "Configure" on the service
4. Follow OAuth flow

---

## Troubleshooting

### Riley's messages don't sound right
→ Update the **Brand Voice** in Guidelines

### Too many tasks in queue
→ Consider raising autonomy level or adjusting approval rules

### Low response rates
→ Check Analytics, review rejected messages, update templates

### Riley keeps making the same mistake
→ Add it to **Failure Patterns** in Criteria

---

## Safety Features

Riley has built-in guardrails:

1. **Never discusses salary** without approval
2. **Never sends offers** without approval
3. **Rate limited** to prevent spam
4. **Audit trail** of every action
5. **One-click pause** if anything goes wrong

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `A` | Approve selected task |
| `R` | Reject selected task |
| `E` | Edit selected task |
| `J` | Next task |
| `K` | Previous task |
| `?` | Show all shortcuts |

---

## Getting Help

- **Documentation**: This manual
- **Support**: support@yourcompany.com
- **Slack**: #riley-help channel

---

## Quick Reference Card

```
┌────────────────────────────────────────────────────────┐
│                  RILEY QUICK REFERENCE                  │
├────────────────────────────────────────────────────────┤
│                                                        │
│  DAILY CHECKLIST                                       │
│  □ Check Queue for pending approvals                   │
│  □ Review urgent items first                           │
│  □ Batch approve routine follow-ups                    │
│                                                        │
│  KEY PAGES                                             │
│  /queue      → Approve Riley's work                    │
│  /guidelines → Tell Riley HOW to recruit              │
│  /criteria   → Tell Riley WHAT good looks like        │
│  /analytics  → See performance metrics                 │
│                                                        │
│  REMEMBER                                              │
│  • Riley proposes, you approve                         │
│  • Every rejection teaches Riley                       │
│  • When in doubt, check the queue                      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

*Riley Recruiter v1.0 - Built with the Two-Loop Paradigm*
