/**
 * Pattern and walker for RNG's ``list`` elements.
 * @author Louis-Dominique Dubeau
 * @license MPL 2.0
 * @copyright Mangalam Research Center for Buddhist Languages
 */
import { ValidationError } from "../errors";
import { NameResolver } from "../name_resolver";
import { BasePattern, EndResult, Event, EventSet, InternalFireEventResult,
         InternalWalker, OneSubpattern } from "./base";
import { Define } from "./define";
import { Ref } from "./ref";

/**
 * List pattern.
 */
export class List extends OneSubpattern {
  _computeHasEmptyPattern(): boolean {
    return this.pat.hasEmptyPattern();
  }

  // We override these because lists cannot contain attributes so there's
  // no point in caching _hasAttrs's result.
  _prepare(definitions: Map<string, Define>,
           namespaces: Set<string>): Ref[] | undefined {
    const ret = this.pat._prepare(definitions, namespaces);
    this._cachedHasEmptyPattern = this._computeHasEmptyPattern();

    return ret;
  }

  hasAttrs(): boolean {
    return false;
  }

  newWalker(): InternalWalker<List> {
    const hasEmptyPattern = this.hasEmptyPattern();
    // tslint:disable-next-line:no-use-before-declare
    return new ListWalker(this,
                          this.pat.newWalker(),
                          hasEmptyPattern,
                          hasEmptyPattern);
  }
}

/**
 * Walker for [[List]].
 *
 */
class ListWalker extends InternalWalker<List> {
  constructor(protected readonly el: List,
              private readonly subwalker: InternalWalker<BasePattern>,
              public canEndAttribute: boolean,
              public canEnd: boolean) {
    super();
  }

  clone(): this {
    return new ListWalker(this.el,
                          this.subwalker.clone(),
                          this.canEndAttribute,
                          this.canEnd) as this;
  }

  possible(): EventSet {
    return this.subwalker.possible();
  }

  possibleAttributes(): EventSet {
    return new Set<Event>();
  }

  fireEvent(name: string, params: string[],
            nameResolver: NameResolver): InternalFireEventResult {
    // Only this can match.
    if (name !== "text") {
      return new InternalFireEventResult(false);
    }

    const trimmed = params[0].trim();

    // The list walker cannot send empty strings to its children because it
    // validates a list of **tokens**.
    if (trimmed === "") {
      return new InternalFireEventResult(true);
    }

    // ret is necessarily set by the loop because we deal with the empty case
    // above.
    let ret!: InternalFireEventResult;
    for (const token of trimmed.split(/\s+/)) {
      ret = this.subwalker.fireEvent("text", [token], nameResolver);
      if (!ret.matched) {
        this.canEndAttribute = this.canEnd = false;

        return ret;
      }
    }

    this.canEndAttribute = this.canEnd = this.subwalker.canEnd;

    // It is not possible for ret to be undefined here.
    return ret;
  }

  end(): EndResult {
    if (this.canEnd) {
      return false;
    }

    const ret = this.subwalker.end();

    return ret !== false ? ret : [new ValidationError("unfulfilled list")];
  }

  endAttributes(): EndResult {
    return false;
  }
}

//  LocalWords:  RNG's MPL nd
