/** Shared instructions stay available before joining and throughout play. */
export function RoomRules() {
  return (
    <div className="room-rules">
      <p><strong>Goal:</strong> complete the homestead tutorial together. Follow the current quest and its Show me button. Rewards and progress belong to the room; you can keep playing after completion.</p>
      <p><strong>One household:</strong> both players spend the same budget and stocks. The two simulated residents supply household labor; joining as a human player adds no resident or labor. DIY construction and daily jobs compete for that time.</p>
      <p><strong>Connect your systems:</strong> a garden needs water, a powered pump needs electricity, and construction needs household labor. Check inputs, outputs and the needs checklist when a system is idle.</p>
      <p><strong>Divide the work informally:</strong> try one person on water + energy, the other on food + shelter. Both can manage everything. Agree before large purchases: responsibilities do not reserve money, resources or systems.</p>
      <p><strong>Time:</strong> plan and edit while paused. Both choose Ready to run at one simulated day per second; either can Pause together. Survival alerts, construction and harvest pause everyone. Pausing or disconnecting clears both Ready states; reconnecting never resumes time automatically.</p>
      <p><strong>Recover:</strong> shortages can be repaired. Pause, inspect the needs checklist, buy missing supplies in Market and adjust Work before trying again. Committed room progress is saved on the host. Keep this browser tab: refresh and short network losses reclaim your seat, but closing the tab or clearing its data loses your reconnect credential. A save failure pauses edits and needs the host owner’s attention.</p>
      <details>
        <summary>Your first 10–15 minutes</summary>
        <ol>
          <li>Invite your teammate, enter the homestead and agree who will check water and who will check household supplies. Stay paused while planning.</li>
          <li>Use the first quest’s Show me button to find the rain barrel. Inspect the drinking water filter too; check water stocks and needed inputs together.</li>
          <li>One player plans water storage and filtration; the other checks food and recurring supplies in Market and household priorities in Work. Confirm costs together before buying.</li>
          <li>Both choose Ready, watch the first simulated days, then pause to review the shared quest and needs checklist. Aim for the first water quest as your opening achievement.</li>
        </ol>
        <p>The full tutorial includes crop growth and cold-weather waits. It is a longer goal, not a timed 15-minute challenge. Quests are checked at the end of a simulated day.</p>
        <p>Map controls: click or tap a system to select it; drag empty land to pan; use the mouse wheel or a two-finger pinch to zoom. Choose Buy or DIY in a system card, then click or tap the map to place it. Zoom to fit restores the view. Collapse the catalog drawer to make room on a tablet.</p>
      </details>
    </div>
  );
}
