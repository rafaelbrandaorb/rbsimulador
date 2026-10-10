<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep Ladder and HMI on a single project and shared scan runtime; tag-linked commands must drive the same bits the PLC reads.
- Use separate HMI editing and testing modes, with pointer capture for momentary commands, to avoid moving objects while operating them.
- Validate imported projects structurally and block execution of invalid tags so student files cannot crash the simulator.
- Persist student projects locally and through portable JSON files; this simulator intentionally works without accounts or a hosted backend.
- Keep instrument value selection shared across displays, gauges and trends; trend history is runtime-only, bounded to 60 samples and sampled only while the PLC runs.
- Serial TON/TOF blocks pass their done state to downstream instructions so connected coils respect timer delays.
- Counters share the PLC scan runtime, count rising edges only, and expose done/current/preset to Ladder and HMI; reset/load commands take priority over counting.
