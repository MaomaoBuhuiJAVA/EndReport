# Long-Press Voice Input Design

## Goal

Replace the compact voice-input state in the 科小贝 chat composer with a mobile-first press-and-hold interaction. The change keeps the current browser speech-recognition path, fills recognized text into the draft input, and leaves message sending under explicit user control.

## Scope

- Modify `robot-console/src/components/SciencePet.tsx` and `robot-console/app/globals.css` only, plus the existing component contract test.
- Keep `getSpeechRecognitionConstructor`, `startVoiceInput`, `stopVoiceInput`, `sendMessage`, the existing chat API, and the current Lucide icon set.
- Do not add recording-file upload, a new speech provider, or automatic message sending.

## Interaction

1. The user switches the composer to voice mode, then presses and holds the existing voice button with a finger or primary mouse button.
2. A fixed, semi-transparent black modal layer appears over the viewport while the underlying chat remains visible.
3. The modal puts a green rounded speech bubble at the lower center. A CSS-only waveform inside it scales from an analyser-like level generated from recognition lifecycle and pointer motion; it requires no new audio dependency.
4. The modal displays `松手转文字`, with two large target areas at the bottom: cancel on the left and transcription on the right.
5. Pointer movement is tracked while the button holds pointer capture. Moving left beyond a defined threshold sets `voiceCancelPending`; the cancel target and bubble adopt the destructive state. Moving back restores the normal transcription state.
6. Releasing in cancellation state aborts recognition, restores the pre-hold draft unchanged, dismisses the modal, and provides a short status message.
7. Releasing normally enters `processing`, retains the modal with a transcription indicator, and stops recognition. Recognition result text is merged into the pre-hold draft exactly as today. On `onend`, the modal closes and the existing composer notice tells the user that the text can be edited or sent.

## States And Errors

`VoiceStatus` remains the source for lifecycle rendering. The new overlay is visible during `starting`, `listening`, and `processing`.

- `not-allowed` and `service-not-allowed`: close overlay and show the existing permission notice.
- `audio-capture`: close overlay and report missing microphone.
- `no-speech` or an empty completed transcript: close overlay and report that the input was too short or not heard.
- `network` and generic recognition failures: close overlay and report the existing network/failure notice.
- Pointer cancellation, losing pointer capture, and releasing over the cancel target all discard the current partial transcript.

## Accessibility And Responsive Layout

- The overlay uses `role="status"` for non-blocking recognition messages and contains descriptive state text in addition to the waveform.
- The actual trigger remains a native button and keeps pointer capture for touch and mouse compatibility.
- Overlay is fixed with an intentionally higher stacking level than the chat panel and bottom navigation.
- Bottom controls include `env(safe-area-inset-bottom)` padding, have a minimum 56px touch height, and use a mobile-first one-column composition that also works at desktop widths.
- Reduced-motion users see static waveform bars without an animation.

## Tests And Validation

- Extend `SciencePet.inplace-actions.contract.test.mjs` to require the overlay, left-cancel movement handling, explicit abort path, normal stop path, and no automatic `sendMessage` from voice recognition.
- Run the contract test before implementation and confirm it fails on the missing overlay contract.
- Run the component contract suite, lint, and production build after implementation.
- Use a 390px-wide browser viewport to verify: overlay appears above the composer, targets remain visible above the safe area, and the underlying input/bottom navigation do not bleed through as interactable elements.
