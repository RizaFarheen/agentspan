// ── Termination conditions ──────────────────────────────

/**
 * Abstract base class for termination conditions.
 * Supports compositional `.and()` and `.or()` operators.
 */
export abstract class TerminationCondition {
  /**
   * Combine with another condition via AND — both must be met.
   */
  and(other: TerminationCondition): AndCondition {
    return new AndCondition(this, other);
  }

  /**
   * Combine with another condition via OR — either can trigger.
   */
  or(other: TerminationCondition): OrCondition {
    return new OrCondition(this, other);
  }

  /**
   * Serialize to the wire format object.
   */
  abstract toJSON(): object;
}

// ── Concrete conditions ─────────────────────────────────

/**
 * Terminate when a specific text is mentioned in the output.
 */
export class TextMention extends TerminationCondition {
  readonly text: string;
  readonly caseSensitive: boolean;

  constructor(text: string, caseSensitive = false) {
    super();
    this.text = text;
    this.caseSensitive = caseSensitive;
  }

  toJSON(): object {
    return {
      type: 'text_mention',
      text: this.text,
      caseSensitive: this.caseSensitive,
    };
  }
}

/**
 * Terminate when a specific stop message is received.
 */
export class StopMessage extends TerminationCondition {
  readonly stopMessage: string;

  constructor(stopMessage: string) {
    super();
    this.stopMessage = stopMessage;
  }

  toJSON(): object {
    return {
      type: 'stop_message',
      stopMessage: this.stopMessage,
    };
  }
}

/**
 * Terminate after a maximum number of messages.
 */
export class MaxMessage extends TerminationCondition {
  readonly maxMessages: number;

  constructor(maxMessages: number) {
    super();
    this.maxMessages = maxMessages;
  }

  toJSON(): object {
    return {
      type: 'max_message',
      maxMessages: this.maxMessages,
    };
  }
}

/**
 * Terminate when token usage exceeds specified limits.
 */
export class TokenUsageCondition extends TerminationCondition {
  readonly maxTotalTokens?: number;
  readonly maxPromptTokens?: number;
  readonly maxCompletionTokens?: number;

  constructor(options: {
    maxTotalTokens?: number;
    maxPromptTokens?: number;
    maxCompletionTokens?: number;
  }) {
    super();
    this.maxTotalTokens = options.maxTotalTokens;
    this.maxPromptTokens = options.maxPromptTokens;
    this.maxCompletionTokens = options.maxCompletionTokens;
  }

  toJSON(): object {
    const result: Record<string, unknown> = { type: 'token_usage' };
    if (this.maxTotalTokens !== undefined) result.maxTotalTokens = this.maxTotalTokens;
    if (this.maxPromptTokens !== undefined) result.maxPromptTokens = this.maxPromptTokens;
    if (this.maxCompletionTokens !== undefined) result.maxCompletionTokens = this.maxCompletionTokens;
    return result;
  }
}

// ── Composite conditions ────────────────────────────────

/**
 * AND composition — all conditions must be met.
 */
export class AndCondition extends TerminationCondition {
  readonly conditions: TerminationCondition[];

  constructor(...conditions: TerminationCondition[]) {
    super();
    this.conditions = conditions;
  }

  toJSON(): object {
    return {
      type: 'and',
      conditions: this.conditions.map((c) => c.toJSON()),
    };
  }
}

/**
 * OR composition — any condition can trigger termination.
 */
export class OrCondition extends TerminationCondition {
  readonly conditions: TerminationCondition[];

  constructor(...conditions: TerminationCondition[]) {
    super();
    this.conditions = conditions;
  }

  toJSON(): object {
    return {
      type: 'or',
      conditions: this.conditions.map((c) => c.toJSON()),
    };
  }
}
