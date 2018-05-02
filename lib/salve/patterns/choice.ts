/**
 * Pattern and walker for RNG's ``choice`` elements.
 * @author Louis-Dominique Dubeau
 * @license MPL 2.0
 * @copyright Mangalam Research Center for Buddhist Languages
 */
import { ChoiceError } from "../errors";
import * as namePatterns from "../name_patterns";
import { NameResolver } from "../name_resolver";
import { union } from "../set";
import { BasePattern, cloneIfNeeded, CloneMap, EndResult, Event, EventSet,
         InternalFireEventResult, InternalWalker, isAttributeEvent, Pattern,
         TwoSubpatterns } from "./base";
import { Empty } from "./empty";

/**
 * A pattern for ``<choice>``.
 */
export class Choice extends TwoSubpatterns {
  optional: boolean;

  constructor(xmlPath: string, patA: Pattern, patB: Pattern) {
    super(xmlPath, patA, patB);
    this.optional = patA instanceof Empty;
  }

  protected _computeHasEmptyPattern(): boolean {
    return this.patA.hasEmptyPattern() || this.patB.hasEmptyPattern();
  }

  newWalker(resolver: NameResolver): InternalWalker<Choice> {
    return this.optional ?
      // tslint:disable-next-line:no-use-before-declare
      new OptionalChoiceWalker(this, resolver) :
      // tslint:disable-next-line:no-use-before-declare
      new ChoiceWalker(this, resolver);
  }
}

/**
 * Walker for [[Choice]].
 */
class ChoiceWalker extends InternalWalker<Choice> {
  private readonly hasAttrs: boolean;
  private readonly walkerA: InternalWalker<BasePattern>;
  private readonly walkerB: InternalWalker<BasePattern>;
  private deactivateA: boolean;
  private deactivateB: boolean;
  private readonly nameResolver: NameResolver;
  canEndAttribute: boolean;
  canEnd: boolean;

  constructor(walker: ChoiceWalker, memo: CloneMap);
  constructor(el: Choice, nameResolver: NameResolver);
  constructor(elOrWalker: ChoiceWalker | Choice,
              nameResolverOrMemo: NameResolver | CloneMap)
  {
    super(elOrWalker);
    if ((elOrWalker as Choice).newWalker !== undefined) {
      const el = elOrWalker as Choice;
      const nameResolver = nameResolverOrMemo as NameResolver;
      this.hasAttrs = el.hasAttrs();
      this.nameResolver = nameResolver;
      this.deactivateA = false;
      this.deactivateB = false;
      const walkerA = this.walkerA = el.patA.newWalker(nameResolver);
      const walkerB = this.walkerB = el.patB.newWalker(nameResolver);
      this.canEndAttribute = !this.hasAttrs ||
        walkerA.canEndAttribute || walkerB.canEndAttribute;
      this.canEnd = walkerA.canEnd || walkerB.canEnd;
    }
    else {
      const walker = elOrWalker as ChoiceWalker;
      const memo = nameResolverOrMemo as CloneMap;
      this.hasAttrs = walker.hasAttrs;
      this.nameResolver = cloneIfNeeded(walker.nameResolver, memo);
      this.walkerA = walker.walkerA._clone(memo);
      this.walkerB = walker.walkerB._clone(memo);
      this.deactivateA = walker.deactivateA;
      this.deactivateB = walker.deactivateB;
      this.canEndAttribute = walker.canEndAttribute;
      this.canEnd = walker.canEnd;
    }
  }

  _clone(memo: CloneMap): this {
    return new ChoiceWalker(this, memo) as this;
  }

  possible(): EventSet {
    const walkerA = this.walkerA;
    let ret = this.deactivateA ? undefined : walkerA.possible();

    const walkerB = this.walkerB;
    if (!this.deactivateB) {
      const possibleB = walkerB.possible();
      if (ret === undefined) {
        ret = possibleB;
      }
      else {
        union(ret, possibleB);
      }
    }
    else if (ret === undefined) {
      ret = new Set<Event>();
    }

    return ret;
  }

  possibleAttributes(): EventSet {
    const walkerA = this.walkerA;
    let ret = this.deactivateA ? undefined : walkerA.possibleAttributes();

    const walkerB = this.walkerB;
    if (!this.deactivateB) {
      const possibleB = walkerB.possibleAttributes();
      if (ret === undefined) {
        ret = possibleB;
      }
      else {
        union(ret, possibleB);
      }
    }
    else if (ret === undefined) {
      ret = new Set<Event>();
    }

    return ret;
  }

  fireEvent(name: string, params: string[]): InternalFireEventResult {
    const ret = new InternalFireEventResult(false);
    if (this.deactivateA && this.deactivateB) {
      return ret;
    }

    const evIsAttributeEvent = isAttributeEvent(name);
    if (evIsAttributeEvent && !this.hasAttrs) {
      return ret;
    }

    const retA = this.deactivateA ? new InternalFireEventResult(false) :
      this.walkerA.fireEvent(name, params);
    const retB = this.deactivateB ? new InternalFireEventResult(false) :
      this.walkerB.fireEvent(name, params);

    if (retA.matched) {
      if (!retB.matched) {
        this.deactivateB = true;
        if (evIsAttributeEvent) {
          this.canEndAttribute = this.walkerA.canEndAttribute;
        }

        this.canEnd = this.walkerA.canEnd;
      }
      else {
        if (evIsAttributeEvent) {
          this.canEndAttribute = this.walkerA.canEndAttribute ||
            this.walkerB.canEndAttribute;
        }

        this.canEnd = this.walkerA.canEnd || this.walkerB.canEnd;
      }

      return retA.combine(retB);
    }

    if (retB.matched) {
      this.deactivateA = true;
      if (evIsAttributeEvent) {
        this.canEndAttribute = this.walkerB.canEndAttribute;
      }

      this.canEnd = this.walkerB.canEnd;
    }

    return retB.combine(retA);
  }

  end(): EndResult {
    if (this.canEnd) {
      // Instead of an ended flag, we set both flags.
      this.deactivateA = true;
      this.deactivateB = true;

      return false;
    }

    const retA = this.deactivateA ? false : this.walkerA.end();
    const retB = this.deactivateB ? false : this.walkerB.end();

    if (!retA) {
      return retB;
    }

    if (!retB) {
      return retA;
    }

    // If we are here both walkers exist and returned an error. We combine the
    // errors no matter which walker may have been deactivated.
    const namesA: namePatterns.Base[] = [];
    let notAChoiceError = false;
    this.walkerA.possible().forEach((ev: Event) => {
      if (ev.params[0] === "enterStartTag") {
        namesA.push(ev.params[1] as namePatterns.Base);
      }
      else {
        notAChoiceError = true;
      }
    });

    // The as boolean casts are necessary due to a flaw in the type inference
    // done by TS. Without the cast, TS thinks notAChoiceError is necessarily
    // false here and tslint issues a warning.
    if (!(notAChoiceError as boolean)) {
      const namesB: namePatterns.Base[] = [];
      this.walkerB.possible().forEach((ev: Event) => {
        if (ev.params[0] === "enterStartTag") {
          namesB.push(ev.params[1] as namePatterns.Base);
        }
        else {
          notAChoiceError = true;
        }
      });

      if (!(notAChoiceError as boolean)) {
        return [new ChoiceError(namesA, namesB)];
      }
    }

    // If we get here, we were not able to raise a ChoiceError, possibly
    // because there was not enough information to decide among the two
    // walkers. Return whatever error comes first.
    return retA;
  }

  endAttributes(): EndResult {
    if (this.canEndAttribute) {
      return false;
    }

    const retA = this.deactivateA ? false : this.walkerA.endAttributes();
    const retB = this.deactivateB ? false : this.walkerB.endAttributes();

    if (!retA) {
      return retB;
    }

    if (!retB) {
      return retA;
    }

    // If we are here both walkers exist and returned an error. We combine the
    // errors no matter which walker may have been deactivated.
    const namesA: namePatterns.Base[] = [];
    let notAChoiceError = false;
    this.walkerA.possible().forEach((ev: Event) => {
      if (ev.params[0] === "enterStartTag") {
        namesA.push(ev.params[1] as namePatterns.Base);
      }
      else {
        notAChoiceError = true;
      }
    });

    // The as boolean casts are necessary due to a flaw in the type inference
    // done by TS. Without the cast, TS thinks notAChoiceError is necessarily
    // false here and tslint issues a warning.
    if (!(notAChoiceError as boolean)) {
      const namesB: namePatterns.Base[] = [];
      this.walkerB.possible().forEach((ev: Event) => {
        if (ev.params[0] === "enterStartTag") {
          namesB.push(ev.params[1] as namePatterns.Base);
        }
        else {
          notAChoiceError = true;
        }
      });

      if (!(notAChoiceError as boolean)) {
        return [new ChoiceError(namesA, namesB)];
      }
    }

    // If we get here, we were not able to raise a ChoiceError, possibly
    // because there was not enough information to decide among the two
    // walkers. Return whatever error comes first.
    return retA;
  }
}

/**
 * Walker for [[Choice]].
 */
class OptionalChoiceWalker extends InternalWalker<Choice> {
  private readonly hasAttrs: boolean;
  private readonly walkerB: InternalWalker<BasePattern>;
  private ended: boolean;
  private readonly nameResolver: NameResolver;
  canEndAttribute: boolean;
  canEnd: boolean;

  constructor(walker: OptionalChoiceWalker, memo: CloneMap);
  constructor(el: Choice, nameResolver: NameResolver);
  constructor(elOrWalker: OptionalChoiceWalker | Choice,
              nameResolverOrMemo: NameResolver | CloneMap)
  {
    super(elOrWalker);
    if ((elOrWalker as Choice).newWalker !== undefined) {
      const el = elOrWalker as Choice;
      const nameResolver = nameResolverOrMemo as NameResolver;
      this.hasAttrs = el.hasAttrs();
      this.nameResolver = nameResolver;
      this.ended = false;
      this.walkerB = el.patB.newWalker(nameResolver);
      this.canEndAttribute = true;
      this.canEnd = true;
    }
    else {
      const walker = elOrWalker as OptionalChoiceWalker;
      const memo = nameResolverOrMemo as CloneMap;
      this.hasAttrs = walker.hasAttrs;
      this.nameResolver = cloneIfNeeded(walker.nameResolver, memo);
      this.walkerB = walker.walkerB._clone(memo);
      this.ended = walker.ended;
      this.canEndAttribute = walker.canEndAttribute;
      this.canEnd = walker.canEnd;
    }
  }

  _clone(memo: CloneMap): this {
    return new OptionalChoiceWalker(this, memo) as this;
  }

  possible(): EventSet {
    return this.ended ? new Set<Event>() : this.walkerB.possible();
  }

  possibleAttributes(): EventSet {
    return this.ended ? new Set<Event>() : this.walkerB.possibleAttributes();
  }

  fireEvent(name: string, params: string[]): InternalFireEventResult {
    const ret = new InternalFireEventResult(false);
    if (this.ended) {
      return ret;
    }

    const evIsAttributeEvent = isAttributeEvent(name);
    if (evIsAttributeEvent && !this.hasAttrs) {
      return ret;
    }

    const retA =
      new InternalFireEventResult(name === "text" && !/\S/.test(params[0]));

    if (retA.matched) {
      return retA;
    }

    const retB = this.walkerB.fireEvent(name, params);
    if (retB.matched) {
      if (evIsAttributeEvent) {
        this.canEndAttribute = this.walkerB.canEndAttribute;
      }

      this.canEnd = this.walkerB.canEnd;
    }

    return retB;
  }

  end(): EndResult {
    if (this.canEnd) {
      this.ended = true;

      return false;
    }

    return this.walkerB.end();
  }

  endAttributes(): EndResult {
    if (this.canEndAttribute) {
      return false;
    }

    return this.walkerB.endAttributes();
  }
}

//  LocalWords:  RNG's MPL retA ChoiceWalker enterStartTag notAChoiceError
//  LocalWords:  tslint ChoiceError
