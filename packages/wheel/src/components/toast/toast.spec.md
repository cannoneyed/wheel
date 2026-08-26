# Toast behavior specification

- Toast reports a temporary result or status without blocking the current task.
- Provider and manager own queue state. Viewport owns placement. Root composes Content, Title, Description, Action, and Close.
- Info, success, warning, and error tones pair visual treatment with text and suitable live-region priority.
- New polite messages do not interrupt current speech. Urgent error messages use assertive announcement only when required.
- Duplicate ids update the existing Toast instead of announcing a second copy.
- Timeout pauses on pointer hover, keyboard focus, page visibility loss, and active swipe.
- Timeout resumes with the correct remaining duration.
- Action uses Button semantics and remains available until activation completes or the Toast closes.
- Close has an accessible name and removes the Toast once.
- Swipe follows viewport edge and text direction, captures the pointer, and uses distance or velocity to dismiss.
- A canceled swipe returns to rest without changing timeout ownership.
- Queue limits and overflow preserve newest or highest-priority messages according to manager policy.
- Toast appears immediately in its final position. It never fades or slides in.
- Timeout, action, close, and swipe dismissal may fade or slide out with shared exit tokens.
- Reduced motion dismisses immediately. Forced colors preserves tone, action, close, and focus.
- Browser proof covers queue updates, announcements, pause-resume, action, every dismissal, swipe, and repeated ids.
