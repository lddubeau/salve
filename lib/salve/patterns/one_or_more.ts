/**
 * Pattern and walker for RNG's ``oneOrMore`` elements.
 * @author Louis-Dominique Dubeau
 * @license MPL 2.0
 * @copyright Mangalam Research Center for Buddhist Languages
 */
import { NameResolver } from "../name_resolver";
import { union } from "../set";
import { addWalker, BasePattern, CloneMap, EndResult, EventSet,
         InternalFireEventResult, InternalWalker, isAttributeEvent, matched,
         OneSubpattern } from "./base";

/**
 * A pattern for ``<oneOrMore>``.
 */
export class  OneOrMore extends OneSubpattern {
  _computeHasEmptyPattern(): boolean {
    return this.pat.hasEmptyPattern();
  }
}

/**
 * Walker for [[OneOrMore]]
 */
class OneOrMoreWalker extends InternalWalker<OneOrMore> {
  private readonly hasAttrs: boolean;
  private currentIteration: InternalWalker<BasePattern>;
  private nextIteration: InternalWalker<BasePattern> | undefined;
  private readonly nameResolver: NameResolver;
  canEndAttribute: boolean;
  canEnd: boolean;

  /**
   * @param el The pattern for which this walker was created.
   *
   * @param resolver The name resolver that can be used to convert namespace
   * prefixes to namespaces.
   */
  protected constructor(walker: OneOrMoreWalker, memo: CloneMap);
  protected constructor(el: OneOrMore, nameResolver: NameResolver);
  protected constructor(elOrWalker: OneOrMoreWalker | OneOrMore,
                        nameResolverOrMemo: NameResolver | CloneMap) {
    if ((elOrWalker as OneOrMore).newWalker !== undefined) {
      const el = elOrWalker as OneOrMore;
      const nameResolver = nameResolverOrMemo as NameResolver;
      super(el);
      this.hasAttrs = el.hasAttrs();
      this.nameResolver = nameResolver;
      this.currentIteration = this.el.pat.newWalker(nameResolver);
      this.canEndAttribute = !this.hasAttrs ||
        this.currentIteration.canEndAttribute;
      this.canEnd = this.currentIteration.canEnd;
    }
    else {
      const walker = elOrWalker as OneOrMoreWalker;
      const memo = nameResolverOrMemo as CloneMap;
      super(walker, memo);
      this.hasAttrs = walker.hasAttrs;
      this.nameResolver = this._cloneIfNeeded(walker.nameResolver, memo);
      this.currentIteration = walker.currentIteration._clone(memo);
      this.nextIteration = walker.nextIteration !== undefined ?
        walker.nextIteration._clone(memo) : undefined;
      this.canEndAttribute = walker.canEndAttribute;
      this.canEnd = walker.canEnd;
    }
  }

  possible(): EventSet {
    const ret = this.currentIteration.possible();

    if (this.currentIteration.canEnd) {
      this._instantiateNextIteration();
      // nextIteration is necessarily defined here due to the previous call.
      // tslint:disable-next-line:no-non-null-assertion
      const nextPossible = this.nextIteration!.possible();

      union(ret, nextPossible);
    }

    return ret;
  }

  possibleAttributes(): EventSet {
    const ret = this.currentIteration.possibleAttributes();

    if (this.currentIteration.canEnd) {
      this._instantiateNextIteration();
      // nextIteration is necessarily defined here due to the previous call.
      // tslint:disable-next-line:no-non-null-assertion
      const nextPossible = this.nextIteration!.possibleAttributes();

      union(ret, nextPossible);
    }

    return ret;
  }

  fireEvent(name: string, params: string[]): InternalFireEventResult {
    const evIsAttributeEvent = isAttributeEvent(name);
    if (evIsAttributeEvent && !this.hasAttrs) {
      return undefined;
    }

    const currentIteration = this.currentIteration;

    const ret = currentIteration.fireEvent(name, params);
    if (ret !== undefined) {
      if (evIsAttributeEvent) {
        this.canEndAttribute = currentIteration.canEndAttribute;
      }
      this.canEnd = currentIteration.canEnd;

      return ret;
    }

    if (currentIteration.canEnd) {
      this._instantiateNextIteration();
      // nextIteration is necessarily defined here due to the previous call.
      // tslint:disable-next-line:no-non-null-assertion
      const nextRet = this.nextIteration!.fireEvent(name, params);
      if (matched(nextRet)) {
        if (currentIteration.end()) {
          throw new Error(
            "internal error; canEnd returns true but end() fails");
        }

        // tslint:disable-next-line:no-non-null-assertion
        this.currentIteration = this.nextIteration!;
        this.nextIteration = undefined;
        if (evIsAttributeEvent) {
          this.canEndAttribute = this.currentIteration.canEndAttribute;
        }

        this.canEnd = this.currentIteration.canEnd;
      }

      return nextRet;
    }

    return undefined;
  }

  end(attribute: boolean = false): EndResult {
    return (attribute && this.canEndAttribute) || (!attribute && this.canEnd) ?
      false :
      this.currentIteration.end(attribute);
  }

  private _instantiateNextIteration(): void {
    if (this.nextIteration === undefined) {
      this.nextIteration = this.el.pat.newWalker(this.nameResolver);
    }
  }
}

addWalker(OneOrMore, OneOrMoreWalker);

//  LocalWords:  RNG's MPL currentIteration nextIteration canEnd oneOrMore rng
//  LocalWords:  anyName suppressAttributes instantiateCurrentIteration
