/**
 * Gmail Conversation Labels — pure classifier.
 *
 * Given a thread's first sender, a sample of its messages, and the user's
 * email, decides which of {inbound, outbound, conversation} apply.
 *
 * No Gmail or PropertiesService access — the caller is responsible for
 * fetching messages (efficiently or not) and for invoking label writes. This
 * separation is what makes the classifier testable in isolation.
 */

/**
 * @typedef {object} MessageSample
 * @property {string} from - The raw "From" header value.
 *
 * @typedef {object} ExistingLabels
 * @property {boolean} [inbound]
 * @property {boolean} [outbound]
 * @property {boolean} [conversation]
 *
 * @typedef {object} ClassifyInput
 * @property {string} firstSender - "From" of the thread's first message.
 * @property {MessageSample[]} messages - Sampled messages in chronological
 *   order. For polling, pass {first, …, latest}; for backfill, pass all.
 * @property {string[]} userEmails - Every address that counts as "me"
 *   (substring match against the From header). For single-identity setups,
 *   pass a one-element array.
 * @property {ExistingLabels} [existingLabels] - Labels already on the thread.
 *
 * @typedef {object} Classification
 * @property {"inbound" | "outbound"} primary
 * @property {boolean} isConversation
 */

/**
 * @param {ClassifyInput} input
 * @return {Classification}
 */
function classifyThread(input) {
  const { firstSender, messages, userEmails, existingLabels = {} } = input;
  const isFromUser = (sender) => userEmails.some((addr) => sender.indexOf(addr) !== -1);

  /** @type {"inbound" | "outbound"} */
  let primary;
  if (existingLabels.outbound) {
    primary = "outbound";
  } else if (existingLabels.inbound) {
    primary = "inbound";
  } else {
    primary = isFromUser(firstSender) ? "outbound" : "inbound";
  }

  if (existingLabels.conversation) {
    return { primary, isConversation: true };
  }
  if (messages.length < 2) {
    return { primary, isConversation: false };
  }

  let userParticipated = false;
  let otherParticipated = false;
  for (const message of messages) {
    if (isFromUser(message.from)) {
      userParticipated = true;
    } else {
      otherParticipated = true;
    }
    if (userParticipated && otherParticipated) break;
  }

  const lastIsFromUser = isFromUser(messages[messages.length - 1].from);

  const isConversation =
    (userParticipated && otherParticipated) ||
    (!!existingLabels.inbound && lastIsFromUser) ||
    (!!existingLabels.outbound && !lastIsFromUser);

  return { primary, isConversation };
}
