# Playing TERRA Homestead Plugin

You plan a homestead on a piece of land. Every system you place (a tent, a well, solar panels, raised beds, chickens) uses things and makes things. The game runs the days forward and shows how much of a household's life your design really covers: water, food, shelter, heat, power, and the rest.

## Your first fifteen minutes

1. **Start.** On your first visit the new-game window asks where your land is (Front Range foothills, the Laramie basin, or a Blue Ridge valley), how big it is, how many adults and children live there, how much money you have, what the weather is like, and what's already there: empty land, a tent camp, or a suburban home to convert.
2. **Follow the quest card** (top right). The quests teach the basics one at a time: shelter two people, drinking water every day for a week, cooking without bought fuel, getting through January warm, growing 10% of your calories, and closing a loop (kitchen scraps → compost → vegetables). Each one names the checklist row it moves. You can skip the tutorial.
3. **Place something.** Pick a system in the drawer on the left (search with `/`: try "eggs" or "heat"). Its card shows what it costs, how long it takes to set up, and what it uses and makes. Choose **Buy** (costs more, less work) or **Build it yourself** (cheaper, more hours), click **Add**, then click the map. A green outline means it fits; red means it overlaps something or is off your land.
4. **Run the clock.** Space pauses; `1`, `2`, `3` run at 1, 3, and 10 days a second. New systems are built with your household's labor first, so they take a while.
5. **Read the checklist** (`N`, or click the score ring). It lists the eleven needs with what your design provides, what the household needs, and the share covered. Switch between **Average year**, **This season**, and **Worst week this year**.

## Every number explains itself

Any number with a dotted underline is a button. Click it to see the formula, every catalog flow that went into it, the site numbers it depends on (like heating degree-days), notes on what limited it, and how confident the catalog is about the systems involved.

## Controls

| Action | Mouse | Keyboard |
|---|---|---|
| Pan | Drag the map (or right/middle drag) | `W` `A` `S` `D` or arrow keys |
| Zoom | Wheel, pinch | `+` / `-`, `0` to fit |
| Search the drawer | | `/` |
| Place | Click the map | Arrows move the cursor, `Enter` places |
| Keep placing | Shift-click | `Shift+Enter` |
| Cancel placing, close a panel | | `Esc` |
| Select | Click; Shift-click to add; Shift-drag a box | |
| Move the selection | Drag | Arrow keys (`Shift` for 10×) |
| Delete | Remove button | `Delete` / `Backspace` |
| Copy, paste | | `Ctrl`/`⌘` + `C`, `V` |
| Undo, redo | | `Ctrl`/`⌘` + `Z`, `Shift+Z` or `Y` |
| Open a system's card | Double-click | `Enter` on a tile |
| Pause, speeds | Top bar | `Space`, `1`, `2`, `3` |
| Checklist, almanac, flows, plan | Top bar | `N`, `L`, `F`, `P` |

Everything can be done with the keyboard. Removing a finished system refunds 25% of what you paid; removing one still under construction refunds all of it.

## Where things are

- **Drawer** (left, or a bottom sheet on a tablet): *Systems* to place; *Inputs* shows what ran short this week (click one to highlight who makes and uses it); *Outputs* shows what was used, stored, spilled, and spoiled.
- **Top bar:** date and weather, cash, labor used and available this week, the off-grid score, flows, and the panels.
- **Flows (`F`):** lines from producers to consumers, sized by amount. Red dashes mean a consumer got less than it asked for; a red ring means nothing in your design makes what it needs.
- **Almanac (`L`):** everything that happened, newest first, with a link to each system on the map.
- **Reports:** at the end of each season and year: coverage by month, what ran short and the chain of causes ("Raised beds short on Water because the Well is short on Electricity because…"), and systems that could fix it.
- **Hints:** when something is short every day for a week, a card suggests up to three systems that make it, cheapest per unit of the shortfall first.

## Placement matters

Trees shade a cabin within 30 feet and cut its cooling need. Bees and mason bees pollinate gardens within 300 feet. Chickens next to a compost pile turn it faster. Trees near a wind turbine slow it down. A rain collector needs a roof within 50 feet (its card lets you choose which roof). Slope helps swales and hurts ponds. Select a tree, a hive, or a coop to see its reach.

## Plan: the planning tools (`P`)

- **Scenarios:** *Duplicate as scenario* pins the current layout; pin up to three (or add a design file) and compare them side by side: the checklist, cost, labor, land, days of stored water and battery, and cash per year. Change a scenario's site to see the same design somewhere else.
- **Weather risk:** runs the layout on the map through many years of real weather (dry and wet years, warm and cold ones, late frosts, heat waves, hail). The result is each need's worst week across the runs, from the worst run to the best, and the chance of a hardship month. *Quick* takes seconds; *Full* (10 years × 200 runs) takes a minute or two and can be cancelled. The panel shows the exact command that reproduces the numbers outside the game.
- In **Scenarios**, the *avg year* figure is the average-year result and *bad week* is the weather-risk result one run in ten does worse than. Seeing them together is the point: a design that looks fine on average can still leave you short in a bad week.
- **Sensitivity:** which site numbers your score depends on most (±20% each), and which flows matter most to your weakest need.
- **Export:** your design (reopens in Scenarios and the command-line simulator), a yearly flow record, the daily ledgers as a spreadsheet (CSV), and a picture of the map.

## Saving

The game autosaves every in-game week in your browser, and keeps the autosave before it as a fallback. **Save** has three slots, **Rewind** to the last autosave, **Export** and **Import** of a `.homestead.json` file (it holds the seed and every action you took, so it replays to exactly the same homestead), and a read-only link to share your layout. If a save is damaged, the game tells you what was wrong and offers your last good autosave; your current game is never replaced by a broken one.

## Settings

Units (imperial or metric; display only), resume speed, when to pause automatically (first shortage, hardship, construction done, harvest, first frost, low cash, end of season), grid snap, a colorblind-safe palette, reduced motion (follows your system setting until you change it), and interface size.

## Real weather or average years

*Average years* repeat the site's typical year exactly, which is best for learning and for comparing designs. *Real weather* varies each year from the game's seed: some years are dry, some are cold, some have a late frost that shortens the growing season, a heat wave, or a hailstorm that wipes out a week of the garden. Weather events show in the top bar and the almanac.
