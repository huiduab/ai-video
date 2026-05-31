"use client";

import { useState } from "react";
import { AssistantPanel } from "@/components/workspace/AssistantPanel";
import { EditorCanvas } from "@/components/workspace/EditorCanvas";
import { ProjectSidebar } from "@/components/workspace/ProjectSidebar";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { mockProjects } from "@/data/mockProjects";
import type { ProjectItem, ProjectMode } from "@/types/project";

export default function WorkspacePage() {
  const [selectedProject, setSelectedProject] = useState<ProjectItem>(mockProjects[0]);
  const [activeMode, setActiveMode] = useState<ProjectMode>(selectedProject.mode);

  function selectProject(project: ProjectItem) {
    setSelectedProject(project);
    setActiveMode(project.mode);
  }

  return (
    <div className="flex h-screen min-w-[1080px] flex-col overflow-hidden bg-[#f7f9ff] text-[14px]">
      <WorkspaceHeader />
      <div className="flex min-h-0 flex-1">
        <ProjectSidebar selectedId={selectedProject.id} onSelect={selectProject} />
        <EditorCanvas activeMode={activeMode} onModeChange={setActiveMode} />
        <AssistantPanel />
      </div>
    </div>
  );
}
