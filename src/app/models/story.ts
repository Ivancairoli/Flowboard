export type TeamMember = { id: string; name: string; fullName: string; initials: string };
export type TaskSpecialty = 'Frontend' | 'Backend' | 'Testing';
export type StoryTask = {
  id: number;
  title: string;
  state: string;
  specialty: TaskSpecialty | null;
  classificationIssue: 'missing' | 'multiple' | null;
  assignee: TeamMember | null;
  completed: boolean;
  deployedToTesting: boolean;
  url: string;
};
export type StoryBug = {
  id: number;
  title: string;
  state: string;
  completed: boolean;
  url: string;
};
export type Story = {
  id: number;
  title: string;
  description: string;
  status: string;
  azureState: string;
  stage: string | null;
  blocked: boolean;
  tone: string;
  progress: number | null;
  message: string;
  assignee: TeamMember | null;
  participants: TeamMember[];
  tasks: StoryTask[];
  bugs: StoryBug[];
  bugCount: number;
  openBugCount: number;
  project: string;
  iteration: string;
  url: string;
};
export type BoardContext = {
  sprints?: { id: string; name: string; path: string }[];
  organization: string;
  project: string;
  team: string;
  iteration: string;
  sprint: string;
};
export type ScopeOption = { id: string; name: string };
export type SprintOption = ScopeOption & {
  path: string;
  timeFrame: string;
  startDate: string | null;
  finishDate: string | null;
};
export type BoardResponse = {
  stories: Story[];
  context: BoardContext;
  syncedAt: string;
  warnings: string[];
};
