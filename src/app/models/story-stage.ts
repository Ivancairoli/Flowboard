import { Story } from './story';

export const STORY_STAGES = [
  { name: 'Sin comenzar', color: '#8591a5', background: '#f0f3f7' },
  { name: 'En desarrollo', color: '#ba8425', background: '#fff7e8' },
  { name: 'Para Testing', color: '#4775df', background: '#edf3ff' },
  { name: 'En testing', color: '#9160ce', background: '#f5effc' },
  { name: 'Testeando', color: '#087e8b', background: '#e8f7f9' },
  { name: 'Finalizadas', color: '#249873', background: '#eaf8f2' },
] as const;

export function storyStage(story: Story): string {
  return story.stage || 'Sin clasificar';
}
