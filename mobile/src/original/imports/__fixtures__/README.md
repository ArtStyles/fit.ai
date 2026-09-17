# CSV import evidence

The records in `../parse.test.ts` are synthetic and hand-authored. They are not exports captured from a device and do not contain anyone's training history. The parser is original code; no OpenGym or other external implementation was copied.

Primary export documentation checked on 2026-09-17:

- Hevy: https://help.hevyapp.com/hc/en-us/articles/38001424401943-How-to-Import-Strong-App-CSV-Files-and-Export-Your-Data-in-Hevy — workout export path and distinction from measurement exports.
- Strong: https://help.strongapp.io/article/235-export-workout-data — CSV export on Android and iOS.
- FitNotes Android: https://www.fitnotesapp.com/settings/ — spreadsheet export, metric/imperial and exercise-specific units.
- FitNotes iOS: https://www.getfitnotes.com/docs/migrate-from-other-apps.html — documented header names, distance units and time notation. This is a separate app/site; it does not certify Android exports.

Public header evidence, used only to identify interoperability fields (not implementation code):

- https://github.com/aimarchirico/gymruntohevy — the author's example Strong export and documented unit-bearing header variants.
- https://dev.to/deadpunnk/looker-studio-python-analisando-meu-treino-de-powerlifting-2ai6 — the author's Strong export analysis demonstrates semicolon delimiters and `Workout Duration`.
- https://www.reddit.com/r/Hevy/comments/1nwf0i4 — a user-provided Hevy header, including imperial weight/distance columns.

Scope/limits:

- 5 MiB UTF-8 text, 20,000 nonblank data rows, at most 128 columns; comma or semicolon CSV, BOM, quoted newlines and escaped quotes.
- English structural headers. ISO dates, explicit numeric day/month choice, and English named months; impossible dates are rejected.
- Header/row units take priority over selected fallback units. Missing units with a measurement are errors. Blank measurements stay null; negative loads are rejected rather than reinterpreted as assistance.
- FitNotes groups by calendar date because the supported export has no session identifier/time. Unknown workout duration remains null. Local source times have no fabricated UTC offset.
- Session keys use the source's workout ID/number when present; otherwise they use source plus normalized start time. FitNotes uses the calendar day. Editable titles and file positions never determine identity, so renamed sessions can be detected as conflicts by persistence. Rows within one file sharing an identity must agree on title, start, end and duration or the file is rejected. Repeated sets remain repeated. Numeric set indices determine order; otherwise the CSV's original set sequence is retained.
- Supported series types normalize to normal/warmup/drop/failure. Unknown labels reject the file with `set-type` rather than creating uncertain training metrics. Rest/Rest Timer rows become exercise notes with a warning, never effective sets; rest-only exercises/sessions are omitted, and a file containing only rest is rejected. Superset membership is retained as a note, not as a newly created routine.
- Validation is all-or-nothing. Tests cover format behavior, not physical-device export compatibility or database persistence.
