# CleanFlow — Cleaning Business OS

Everything a solo cleaner needs to run their business, in one file you own.
No account, no subscription, no internet connection, no monthly fee.

**Client → Quote → Book → Clean → Get Paid → Rebook**

---

## Getting started

1. Unzip the folder anywhere you like — Desktop, Documents, a USB stick.
2. Double-click **`index.html`**.
3. Choose **See the Demo First** to explore a fully populated sample business,
   or **Set Up My Business** for a two-minute setup wizard.

That's it. CleanFlow opens in your normal browser and runs entirely on your
computer.

> **Keep the folder together.** `index.html` needs the `assets` folder beside
> it. Moving or renaming either one will stop it working.

**Works in:** Chrome, Edge, Firefox, Safari — on Windows, Mac, iPad, Android
and iPhone. Best on Chrome or Edge.

**Put it on your phone:** open the folder in a cloud drive app, or open
`index.html` in your phone browser and use *Add to Home Screen*.

---

## The five sections

| | | |
|---|---|---|
| 🏠 | **Home** | What needs your attention today — next job, money owed, follow-ups |
| 👥 | **Clients** | Contacts, property details, gate codes, pets, preferences, history |
| 📅 | **Jobs** | Today / Upcoming / Recurring / Completed, with live checklists and a timer |
| 💰 | **Money** | Smart Quote calculator, quotes, invoices, expenses, profit |
| 🚀 | **Grow** | Rebooking, follow-ups, reviews and referrals — with ready-to-send messages |

### A few things worth knowing

**The Smart Quote calculator** prices a job from the property size, bedrooms,
bathrooms, condition and add-ons, then shows you the estimated cost, profit and
margin *before* you send it. Tap **See calculation** to show your working. Tap
the price to override it — it's your business.

**Finishing a job does four things at once:** marks it complete, raises the
invoice, logs it to the client's history, and — if it's a recurring job — books
the next visit automatically.

**Grow only shows real opportunities.** A client appears under "ready to rebook"
because their actual cleaning interval has lapsed with nothing booked ahead, not
because a counter ticked over.

---

## ⚠️ Your data lives on this device

There is no cloud. Nothing is uploaded anywhere. That means **your backup file
is the only safety net you have.**

- **Back up:** Settings → *Back Up Now*. Saves one `.json` file.
- **Restore:** Settings → *Restore*. Shows you what's in the file before
  replacing anything.
- **Move to a new computer:** back up on the old one, copy CleanFlow and the
  backup file across, then restore.

CleanFlow reminds you when it's been a while. Take the reminder seriously — keep
a backup in your cloud drive or emailed to yourself.

**Clearing your browser's site data will erase CleanFlow.** So will
"Clear browsing data → Cookies and site data". Back up first.

Private/Incognito windows do not save anything at all. CleanFlow will warn you
if it detects this.

**Spreadsheet exports** (Settings → *Export a spreadsheet*) produce CSV files for
clients, jobs, invoices, quotes, expenses and payments — for your accountant, or
just for your own records.

---

## Making it yours

Everything in **Settings** (the circle button, top right):

- Business name, your name, phone, email, service area — these appear on
  invoices, quotes and proposals
- **Currency** — 10 currencies supported
- **Tax** — off by default; turn it on and name it (Tax, VAT, GST…)
- **Services & pricing** — rename, re-price, add your own, switch some off
- **Add-ons** — the extras you upsell, with price and time
- **Cleaning checklists** — full SOPs for Standard, Deep, Move-Out, Airbnb and
  Office. Edit them freely; one step per line
- **Your hourly cost** — what an hour genuinely costs you. This drives every
  profit and margin figure, so it's worth getting roughly right
- **Follow-up timing** — how long before a quote is "stale" or a client is
  "ready to rebook"

Jobs keep their own copy of the checklist from when they were booked, so editing
a template never rewrites the history of work already done.

---

## Handy to know

- Press **`/`** or **Ctrl/Cmd + K** to search anything
- **Undo** appears in the toast after most changes
- Anything destructive asks first, and says exactly what will happen
- **Print / Save PDF** on invoices, quotes and proposals prints clean, without
  the app chrome around it

---

## Troubleshooting

**Nothing saved between sessions**
You're probably in a private window, or your browser is set to clear site data
on close. Check for CleanFlow's warning banner in Settings.

**"CleanFlow couldn't start"**
Your browser is blocking local storage. Try Chrome, Edge or Firefox, and make
sure you're not in a private window.

**The fonts look different offline**
CleanFlow loads its typeface from the web when you're online and falls back to
your system font when you're not. Everything still works.

**I need my data back**
Settings → *Restore*, and pick your most recent backup `.json` file.

---

## For the curious: how it's built

Plain HTML, CSS and JavaScript. No frameworks, no build step, no dependencies,
nothing to install. You can open any file in a text editor and read it.

```
index.html              the app — this is the file you open
assets/css/
  tokens.css            every colour, spacing and type value
  base.css              reset, layout, motion, print rules
  components.css        buttons, cards, forms, overlays
  views.css             screen-specific layout
assets/js/
  core/                 DOM helpers, formatting, storage, routing, state
  data/                 schema + defaults, demo business
  features/             pricing, queries, domain actions, backup/CSV
  ui/                   shell, overlays, reusable controls
  views/                the five sections + onboarding and settings
```

Data is held as a single JSON document in IndexedDB, with localStorage as a
fallback for browsers that block IndexedDB on local files. Writes are debounced
and flushed when the tab closes.

---

*CleanFlow is a one-time purchase. It's yours — no renewal, no account, no
company that can switch it off.*
