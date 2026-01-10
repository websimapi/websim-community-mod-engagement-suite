// Handles interaction with Websim Comments API
import { marked } from "marked";
import DOMPurify from "dompurify";

export async function fetchComments() {
    try {
        const project = await window.websim.getCurrentProject();
        const response = await fetch(`/api/v1/projects/${project.id}/comments?sort_by=newest&first=50`);
        const data = await response.json();
        return data.comments.data || [];
    } catch (e) {
        console.error("Failed to fetch comments", e);
        return [];
    }
}

export async function postComment(text) {
    if (!text.trim()) return;
    try {
        await window.websim.postComment({
            content: text
        });
        return true;
    } catch (e) {
        console.error("Failed to post comment", e);
        return false;
    }
}

export function renderMarkdown(rawContent) {
    // Configure marked to not handle images poorly if needed, but default is usually ok
    const html = marked.parse(rawContent);
    return DOMPurify.sanitize(html);
}