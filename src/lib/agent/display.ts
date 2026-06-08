import type { AgentDisplay, AgentIntentResult } from "@/types/agent";

export function buildAgentDisplay(intent: AgentIntentResult): AgentDisplay {
  if (intent.payload.requiresConfirmation && intent.payload.pendingAction?.type === "CONFIRM_REGENERATE_OUTLINE") {
    return {
      type: "confirmation",
      title: "确认重新生成大纲",
      message: intent.assistantReply,
      action: "CONFIRM_REGENERATE_OUTLINE",
    };
  }

  switch (intent.type) {
    case "GENERATE_OUTLINE":
      return {
        type: "outline",
        title: "已生成视频脚本与分镜",
        items: intent.payload.generatedScript?.scenes.map((scene) => scene.title) ?? intent.payload.outline ?? [],
        script: intent.payload.generatedScript,
      };
    case "REGENERATE_OUTLINE":
      return {
        type: "outline",
        title: "已重新生成视频脚本与分镜",
        items: intent.payload.generatedScript?.scenes.map((scene) => scene.title) ?? intent.payload.outline ?? [],
        script: intent.payload.generatedScript,
      };
    case "ADD_SCENE":
      if (intent.payload.generatedScript) {
        return {
          type: "outline",
          title: "已新增分镜并更新大纲",
          items: intent.payload.generatedScript.scenes.map((scene) => scene.title),
          script: intent.payload.generatedScript,
        };
      }

      return {
        type: "scene-add",
        title: "已分析：增加一个分镜",
        sceneIndex: intent.payload.insertAfterSceneIndex,
        description: intent.payload.sceneBrief,
      };
    case "DELETE_SCENE":
      if (intent.payload.generatedScript) {
        return {
          type: "outline",
          title: intent.payload.deletedSceneTitle
            ? `已删除第 ${intent.payload.deletedSceneIndex ?? intent.payload.sceneIndex ?? ""} 个分镜：${intent.payload.deletedSceneTitle}`
            : "已删除分镜并更新大纲",
          items: intent.payload.generatedScript.scenes.map((scene) => scene.title),
          script: intent.payload.generatedScript,
        };
      }

      return { type: "scene-delete", title: "已分析：删除一个分镜", sceneIndex: intent.payload.sceneIndex };
    case "REGENERATE_SCENE":
      if (intent.payload.generatedScript) {
        return {
          type: "outline",
          title: "已更新视频脚本与分镜",
          items: intent.payload.generatedScript.scenes.map((scene) => scene.title),
          script: intent.payload.generatedScript,
        };
      }

      return {
        type: "scene-regenerate",
        title: "已分析：重新生成一个分镜",
        sceneIndex: intent.payload.sceneIndex,
        description: intent.payload.sceneBrief,
      };
    case "OTHER_REJECTED":
      return {
        type: "rejected",
        title: "无法执行该指令",
        message: intent.payload.rejectedReason ?? intent.assistantReply,
      };
  }
}
