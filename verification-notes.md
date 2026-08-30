# Browser Verification Notes

The desktop simulator loads with the intended Clara dental workspace navigation and a clear verified-database safety message. Starting a simulated call successfully creates call `CALL-BF1F599E`, changes the interface to a live-call workspace, stores the greeting transcript, exposes typed and microphone inputs, and displays the initial `GREETING` state with empty extracted fields and no tool events.

Submitting a complete hygiene-booking request correctly detects `BOOK_APPOINTMENT`, resolves “tomorrow” to 31 August 2026, preserves the requested 10:00 time and service, checks authoritative availability, records a successful `check_availability` tool event, and moves to `CONFIRM_BOOKING`. The deterministic fallback name extractor captured trailing words (“and my phone is”), so that parsing edge case must be tightened before final verification.

After the extraction fix and automated regression check, the simulator resets cleanly and creates a separate call record (`CALL-C7EEB609`) with an independent greeting and context.

The corrected booking request was resubmitted on the new call; the interface entered its processing state without navigation, layout, or input errors.

The corrected request now extracts `Olivia Bennett` cleanly, retains dental hygiene, 31 August 2026, and 10:00, records a successful authoritative availability check, and requests explicit confirmation. The affirmative confirmation was submitted to exercise atomic booking creation and confirmation delivery.

The first affirmative turn was incorrectly escalated because fallback classification treated “Yes, please confirm it” as a low-confidence unknown intent before considering the pending confirmation state. The flow now recognizes natural affirmative wording, maps it to the pending booking action, and has passing regression coverage. The refreshed simulator is ready for a clean confirmation run.

Clean verification call `CALL-E45A890A` is active with the expected greeting, empty context, and no inherited tool events.

The final clean run again reached `CONFIRM_BOOKING` with the correctly extracted patient, service, date, and time plus a successful `check_availability` event. This establishes the exact precondition for testing the fixed affirmative turn.

The fixed affirmative turn completed successfully. Call `CALL-E45A890A` created a confirmed database appointment for Olivia Bennett at 10:00 on 31 August 2026, generated reference `HD-9B6A17`, added an in-app confirmation, moved to `TRANSACTION_COMPLETE`, and displayed successful `create_booking` and `send_confirmation` evidence. No unvalidated confirmation was emitted.

After hot reload, the simulator returned to its clean start state. The successful call remains persisted in the database audit trail even though the transient browser call state was reset.

The call-audit workspace lists the successful booking call, the intentionally retained earlier handoff, and the initial edge-case call with their persisted caller, time, status, and intent. The two-panel layout renders after its loading state and exposes each record for detailed inspection.

Selecting the successful call restores the full transcript, booking reference, and timestamped `check_availability`, `create_booking`, and `send_confirmation` evidence. Selecting the transferred call restores the complete transcript, explicit escalation reason, human-handoff status, and `transfer_to_human` tool event, demonstrating that staff receive context without asking the caller to repeat it.

Knowledge-grounding verification call `CALL-E49CBA1E` started independently with an empty context and no inherited tools.

The Saturday-hours and parking enquiry entered the agent processing state. The response took longer than the booking turns, so server diagnostics are required to distinguish model latency from an application error before final delivery.

The request completed successfully in 11 seconds, returned configured Saturday hours, recorded a grounded tenant-knowledge tool result, and stayed in the call flow. Because the first response omitted the parking portion of the compound question, the grounding formatter now appends tenant parking instructions whenever an hours enquiry also contains parking terms, with regression coverage.

After adding persisted tenant availability slots and correcting the live JSON schema, verification call `CALL-8EAF1F86` started with an empty context and clean audit state for the final browser test.

The live model classified “Do you have a dental hygiene appointment available tomorrow at 11:30?” as `CHECK_AVAILABILITY` with 92% confidence and extracted the configured service, ISO date, and time without fallback. Clara then checked the persisted tenant availability ledger, recorded a successful authoritative tool event, and offered the slot without creating a booking or inventing a transaction.

The practice setup now exposes a dedicated Voice tab. Browser verification shows active built-in transcription and browser speech adapters, plus clear provider-ready guidance for future telephony and TTS implementations. The configuration, audit, and simulator pages were also rechecked at a 390 × 844 responsive viewport.
