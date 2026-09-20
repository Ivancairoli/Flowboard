import { Injectable } from '@angular/core';
import { TaskSubmission, TaskCreationResult } from '../models/task-creation';

@Injectable({ providedIn: 'root' })
export class TaskDrafts {
  // Retain the exact operation IDs if the dialog is closed after a partial/uncertain response.
  readonly submissions = new Map<
    string,
    { payload: TaskSubmission; results: TaskCreationResult[] }
  >();
}
