import { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'

import { ContextBookmark } from '../util/ContextValue'

import * as vscode from 'vscode'

export interface UndoState {
    state: string;
    actionName: string;
}

export class UndoManager {
    private history: UndoState[] = [];
    private redoHistory: UndoState[] = [];
    private readonly MAX_HISTORY = 50;
    private isUndoInProgress = false;

    constructor() {
        // We no longer initialize context on startup using setTimeout.
        // It should be undefined until explicitly set, so the default "when" clauses will evaluate to true.
    }

    private updateContexts() {
        const nextUndo = this.history.length > 0 ? this.history[this.history.length - 1].actionName : undefined;
        const nextRedo = this.redoHistory.length > 0 ? this.redoHistory[this.redoHistory.length - 1].actionName : undefined;
        vscode.commands.executeCommand('setContext', 'codebookmark.undoAction', nextUndo);
        vscode.commands.executeCommand('setContext', 'codebookmark.redoAction', nextRedo);
        vscode.commands.executeCommand('setContext', 'bookmarks.var.bookmark.canUndo', this.canUndo());
        vscode.commands.executeCommand('setContext', 'bookmarks.var.bookmark.canRedo', this.canRedo());
    }

    public saveState(bookmarks: BookmarkSet, actionName: string = 'default') {
        if (this.isUndoInProgress) return;
        const state = JSON.stringify(bookmarks.values.map(b => b.toJSON()));
        this.history.push({ state, actionName });
        this.redoHistory = []; // Clear redo history on new action
        if (this.history.length > this.MAX_HISTORY) {
            this.history.shift(); // remove oldest
        }
        this.updateContexts();
    }

    public canUndo(): boolean {
        return this.history.length > 0;
    }

    public canRedo(): boolean {
        return this.redoHistory.length > 0;
    }

    public undo(currentBookmarks: BookmarkSet): boolean {
        if (!this.canUndo()) {
            return false;
        }

        // Save current state to redo history before undoing
        const currentState = JSON.stringify(currentBookmarks.values.map(b => b.toJSON()));
        
        const prevState = this.history.pop();
        if (!prevState) return false;

        this.redoHistory.push({ state: currentState, actionName: prevState.actionName });

        this.isUndoInProgress = true;
        try {
            const prevStateArray = JSON.parse(prevState.state);
            currentBookmarks.clear();
            const arr = prevStateArray.map((data: any) => Bookmark.fromJSON(data));
            currentBookmarks.addAll(arr);
            
            // Restore context values like folder, file etc.
            const restoreContexts = (bms: Bookmark[]) => {
                for (const bm of bms) {
                    if (bm.isOpened) {
                        bm.contextValue = ContextBookmark.BookmarkPinned;
                    }
                    if (bm.subs.size > 0) restoreContexts(Array.from(bm.subs.values));
                    bm.refreshDisplayProps();
                }
            };
            restoreContexts(currentBookmarks.values);
        } catch (e) {
            console.error("Failed to undo bookmarks state", e);
        } finally {
            this.isUndoInProgress = false;
            this.updateContexts();
        }

        return true;
    }

    public redo(currentBookmarks: BookmarkSet): boolean {
        if (!this.canRedo()) {
            return false;
        }

        // Save current state to undo history before redoing
        const currentState = JSON.stringify(currentBookmarks.values.map(b => b.toJSON()));

        const nextState = this.redoHistory.pop();
        if (!nextState) return false;
        
        this.history.push({ state: currentState, actionName: nextState.actionName });

        this.isUndoInProgress = true;
        try {
            const nextStateArray = JSON.parse(nextState.state);
            currentBookmarks.clear();
            const arr = nextStateArray.map((data: any) => Bookmark.fromJSON(data));
            currentBookmarks.addAll(arr);
            
            const restoreContexts = (bms: Bookmark[]) => {
                for (const bm of bms) {
                    if (bm.isOpened) {
                        bm.contextValue = ContextBookmark.BookmarkPinned;
                    }
                    if (bm.subs.size > 0) restoreContexts(Array.from(bm.subs.values));
                    bm.refreshDisplayProps();
                }
            };
            restoreContexts(currentBookmarks.values);
        } catch (e) {
            console.error("Failed to redo bookmarks state", e);
        } finally {
            this.isUndoInProgress = false;
            this.updateContexts();
        }

        return true;
    }
}

export const undoManager = new UndoManager();
