/**
 * domain command 層 —— **寫入邊界**（規格 §6.3、[ADR-0007](../../../../docs/adr/0007-document-as-single-authority.md)）。
 *
 * 對外只有 command（純函式，吃 doc 吐 doc）與去重 plugin。`EditorState`／`Transaction`
 * 這些 PM-state 內部型別**不從這裡漏出去** —— edge-boundary 規則（見 `admission.ts`）。
 */
export type { CommandResult } from "./result";
export type { ContainerAddress } from "./tree";

export type { MintMoment, TopLevelEntry } from "./identity";
export { MINT_MOMENTS, topLevelScenes, sceneIdNodes, duplicateSceneIds } from "./identity";

export { createNextScene } from "./create-next-scene";
export type { CreateNextSceneOptions } from "./create-next-scene";

export { setBlockType, BLOCK_TYPES } from "./set-block-type";
export type { SetBlockTypeOptions, BlockType } from "./set-block-type";

export { createSubscene, canCreateSubscene, deleteScene, subsceneCount } from "./subscenes";
export type { CreateSubsceneOptions, DeleteSceneOptions, SubsceneAnchor } from "./subscenes";

export {
  intercutTo,
  canIntercut,
  assignFragmentToMember,
  ungroupMember,
  dissolveGroup,
  normalizeFragmentsPlugin,
} from "./groups";
export type {
  IntercutOptions,
  AssignFragmentOptions,
  UngroupMemberOptions,
  DissolveGroupOptions,
} from "./groups";

export { moveScene, moveGroup } from "./move-scene";
export type {
  MoveSceneOptions,
  MoveGroupOptions,
  MoveTarget,
  TopLevelTarget,
  InsideTarget,
} from "./move-scene";

export { deleteBlock, moveBlock, movedBlockLocation } from "./move-block";
export type { MoveBlockOptions, BlockLocation, BlockDestination } from "./move-block";

export {
  addAppearingCharacter,
  dismissAppearingPrompt,
  retitleEntityRefs,
  setSceneLocations,
  setSceneIntExt,
  setManualDraft,
  setAppearingCharacters,
  setDialogueCharacters,
} from "./entity-refs";
export type {
  AddAppearingCharacterOptions,
  DismissAppearingPromptOptions,
  RetitleEntityRefsOptions,
  SetSceneLocationsOptions,
  SetSceneIntExtOptions,
  SetManualDraftOptions,
  SetAppearingCharactersOptions,
  SetDialogueCharactersOptions,
} from "./entity-refs";

export { setSceneExtras, addSceneExtras, takeOneFromExtra } from "./extras";
export type {
  SetSceneExtrasOptions,
  AddSceneExtrasOptions,
  TakeOneFromExtraOptions,
} from "./extras";

export { dedupeSceneIds, dedupeIdsPlugin, dedupeIdsPluginKey } from "./dedupe";
export type { DedupeResult, DedupeOptions, DedupeMeta, Remint } from "./dedupe";

export { satisfiesAdmission, COMMAND_CONTRACTS } from "./admission";
export type { CommandContract, InvariantId } from "./admission";
