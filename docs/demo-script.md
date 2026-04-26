# Demo Script — Client Walkthrough

**Audience:** Enterprise stakeholders, CTO, Head of Digital, Front Office  
**Duration:** ~15 minutes  
**Prerequisite:** `npm install && npm run dev` is running

---

## Scene 1: What Problem Are We Solving? (2 min)

> *"Right now, your traders and relationship managers work with 6–12 separate applications
> that know nothing about each other. When they look up a customer in one system, they
> manually copy the name or ID into three others. Every context switch is a friction point,
> a source of errors, and a compliance risk."*

> *"What you're about to see is a desktop that thinks like a team. When you touch a customer
> in one app, every app that cares about that customer updates automatically."*

---

## Scene 2: The Shell Launcher (1 min)

1. Point to the **FDC3 Desktop Shell** window.
2. Show the **Application Launcher** — five financial apps grouped by domain.
3. Point to the **channel selector** in the top-right: "No Channel" (grey).
4. Click **Customer Search** to open it.
5. Click **Customer Profile** to open it.
6. Click **Portfolio View** to open it.

> *"These apps are completely isolated — they don't share code, they could be from
> different vendors, built in different years. The only thing they have in common
> is a small JavaScript API: window.fdc3."*

---

## Scene 3: Joining a Channel (1 min)

1. In the **Shell** window, click the channel selector, choose **Green (channel-4)**.
2. Show that the status bar now shows "Channel: Green".
3. In each of the three open apps, also join **Green**.

> *"The channel is the broadcast medium. Think of it as the traders all putting
> on the same headset. Now when one app speaks, all apps on that channel listen."*

---

## Scene 4: Context Broadcast (3 min)

1. In **Customer Search**, type "Maria" in the search box.
2. Point to the result: *Maria Garcia, CUST-1001, Private Banking.*
3. Click her row.
4. Switch to **Customer Profile** — it has auto-updated with Maria's full profile.
5. Switch to **Portfolio View** — Maria's 4 positions are loaded.

> *"One click. No copy-paste. No re-typing. The Customer Search broadcast an
> FDC3 contact context and every app that subscribed to fdc3.contact updated itself."*

Show the FDC3 payload:
```json
{
  "type": "fdc3.contact",
  "name": "Maria Garcia",
  "id": { "customerId": "CUST-1001" }
}
```

---

## Scene 5: Channel Filtering (2 min)

1. Open **Payment Action** from the launcher.
2. Leave Payment Action on **No Channel** (don't join Green).
3. In Customer Search, click **Thomas Müller**.
4. Customer Profile and Portfolio View update — Payment Action does NOT.

> *"The channel acts as a filter. Payment Action is not on the Green channel,
> so it stays on Maria Garcia. This is how a second RM can work on a different
> customer on the same desktop without the screens interfering."*

5. Now join Payment Action to Green and click Müller again — now everything updates.

---

## Scene 6: Intent Routing (3 min)

1. Ensure you're back on Maria Garcia (click her in Customer Search).
2. In **Customer Profile**, scroll to the bottom of the profile card.
3. Click the **"💳 Start Payment"** button.
4. **Payment Action** window comes to the front, pre-filled:
   - Customer: Maria Garcia / CUST-1001
   - Amount: EUR 1,250
   - Reference: PAY-...
   - Badge: "Via intent"

> *"What just happened? Customer Profile raised an FDC3 intent called 'StartPayment'
> with a payment request context. The desktop shell's intent engine looked up which
> app handles StartPayment — it found Payment Action in the app directory — and
> delivered the payload. Payment Action didn't need to be 'integrated' with
> Customer Profile. They've never met."*

5. Fill in **Recipient IBAN**: `ES91 2100 0418 4502 0005 1332`
6. Click **✓ Approve Payment** — green confirmation banner appears.

---

## Scene 7: Cross-App Instrument Drill-Down (1 min)

1. Open **Market Watch** from the launcher, join **Green** channel.
2. In **Portfolio View**, click the **AAPL** row.
3. **Market Watch** highlights AAPL automatically.

> *"Portfolio View broadcast an fdc3.instrument context. Market Watch is listening
> for exactly that type on the Green channel — and highlighted the row."*

---

## Scene 8: Workspace Persistence (1 min)

1. Arrange the windows across the screen.
2. In the Shell, click **💾 Save Workspace** → "Saved ✓" appears.
3. Close all app windows.
4. Quit and relaunch Electron (`Ctrl+C` → `npm run dev`).
5. Windows reopen in the same positions with the same channel assignments.

> *"The workspace is your context — not just the data, but the physical layout of
> your workstation at 8:47am. You can save named workspaces for 'Morning Prep',
> 'Client Call', 'End of Day'."*

---

## Scene 9: The Architecture Reveal (2 min)

Switch to a screen share of `docs/architecture.md`:

> *"The key insight is the Interop Abstraction Layer. Every single app only
> knows about `window.fdc3`. Nothing else. Not Electron. Not IPC. Not io.Connect."*

> *"Today the shell is our custom Electron app. Tomorrow it can be io.Connect Desktop,
> OpenFin, or a browser. The swap is a one-file change in the bootstrap — the apps
> don't move at all."*

---

## Closing Questions to Prompt

- "Which of your existing apps would you want to connect first?"
- "Do you have an App Directory / app catalogue we could import?"
- "What's the primary context object — a customer? a trade? a position?"
- "Which desktop provider are you evaluating — io.Connect, OpenFin, or a custom shell?"
