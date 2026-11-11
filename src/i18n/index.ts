import { enDictionary } from './en';
import { bnDictionary } from './bn';

export { enDictionary, bnDictionary };

/** Full static dictionary pair — used by tests and tooling.
 *  The app itself imports en statically and bn lazily. */
export const TRANSLATIONS = { en: enDictionary, bn: bnDictionary } as const;
