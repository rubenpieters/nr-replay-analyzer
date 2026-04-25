interface CardAttributes {
  stripped_title: string;
  card_type_id: string;
  card_subtype_ids: string[];
  cost: string | null;
  side_id: string;
}

interface Card {
  attributes: CardAttributes;
}

export interface SlimCard {
  stripped_title: string;
  card_type_id: string;
  card_subtype_ids: string[];
  cost: string | null;
}

export class CardDb {
  private byTitle: Map<string, CardAttributes>;

  constructor(cards: Card[]) {
    this.byTitle = new Map();
    for (const card of cards) {
      if (card.attributes?.stripped_title) {
        this.byTitle.set(card.attributes.stripped_title, card.attributes);
      }
    }
  }

  isAzEligible(title: string): boolean {
    const attrs = this.byTitle.get(title);
    if (!attrs) return false;
    if (attrs.card_type_id === "hardware") return true;
    if (attrs.card_type_id === "resource") {
      return attrs.card_subtype_ids.includes("connection") || attrs.card_subtype_ids.includes("job");
    }
    return false;
  }

  getPrintedCost(title: string): number | null {
    const attrs = this.byTitle.get(title);
    if (!attrs || attrs.cost === null || attrs.cost === undefined) return null;
    const n = parseInt(attrs.cost, 10);
    return isNaN(n) ? null : n;
  }

  isRunEvent(title: string): boolean {
    const attrs = this.byTitle.get(title);
    if (!attrs) return false;
    return attrs.card_type_id === "event" && attrs.card_subtype_ids.includes("run");
  }

  static fromSlimData(cards: SlimCard[]): CardDb {
    const wrapped = cards.map((c) => ({ attributes: { ...c, side_id: "" } }));
    return new CardDb(wrapped);
  }

}
