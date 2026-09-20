import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
@Component({
  selector: 'app-connection-form',
  imports: [FormsModule],
  templateUrl: './connection-form.html',
  styleUrl: './connection-form.scss',
})
export class ConnectionForm {
  @Input() busy = false;
  @Input() error = '';
  @Output() readonly connectionRequested = new EventEmitter<{ boardUrl: string; pat: string }>();
  boardUrl = '';
  pat = '';
  submit() {
    if (this.busy || !this.boardUrl.trim() || !this.pat.trim()) return;
    const credentials = { boardUrl: this.boardUrl.trim(), pat: this.pat.trim() };
    this.pat = '';
    this.connectionRequested.emit(credentials);
  }
}
