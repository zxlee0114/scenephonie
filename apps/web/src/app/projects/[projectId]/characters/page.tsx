import { notFound } from "next/navigation";

import { schema as kernelSchema } from "@scenephonie/schema";

import { authorizeProject } from "@/authorization";
import { CharacterSheetEditor } from "@/documents/character-sheet-editor";
import { DocumentShell } from "@/documents/document-shell";
import { entityUsage } from "@/editor/entity-usage";
import { projectEntities } from "@/entities";
import { loadScreenplay, openCharacterSheet } from "@/persistence";
import { projectScreenplay } from "@/projects/project-store";

import { saveDocumentAction } from "../documents/actions";
import {
  createCharacterAction,
  renameCharacterAction,
  saveCharacterDescriptionAction,
  scenesShowingCharacterNameAction,
} from "./actions";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 這個專案的角色設定表（畫面上叫「人物介紹」，票券 21 第 ② 片）：專案層、一個專案一份，第一次打開時建立。
 *
 * 網址沒有文件 id，理由同故事大綱。路徑叫 `characters` 而不是文件的 kind：編劇在這裡做的事是整理人物。
 *
 * 劇本的場數在這裡算好帶過去：存在＝被引用要跨文件算（ADR-0005）—— 劇本裡用到的人物在「＋ 加入人物」
 * 裡找得到、印出場數，回頭補表時命中的就是那一位。
 */
export default async function CharactersPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await authorizeProject(projectId);
  if (!project) notFound();

  const [document, entities, screenplay] = await Promise.all([
    openCharacterSheet(project),
    projectEntities(project),
    projectScreenplay(project),
  ]);
  const loaded = screenplay ? await loadScreenplay(screenplay) : null;
  const scenes = loaded ? Object.fromEntries(entityUsage(kernelSchema.nodeFromJSON(loaded.doc))) : {};

  return (
    <DocumentShell projectId={project.projectId}>
      <CharacterSheetEditor
        initialBody={document.body}
        initialToken={document.token}
        save={saveDocumentAction.bind(null, { projectId: project.projectId }, document.documentId)}
        characters={entities.characters}
        scenes={scenes}
        createCharacter={createCharacterAction.bind(null, project.projectId)}
        saveDescription={saveCharacterDescriptionAction.bind(null, project.projectId)}
        rename={{
          count: scenesShowingCharacterNameAction.bind(null, project.projectId),
          run: renameCharacterAction.bind(null, project.projectId),
        }}
      />
    </DocumentShell>
  );
}
