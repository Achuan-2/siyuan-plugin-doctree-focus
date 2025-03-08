import {
    Plugin,
    showMessage,
    confirm,
    Dialog,
    Menu,
    openTab,
    adaptHotkey,
    getFrontend,
    getBackend,
    IModel,
    Protyle,
    openWindow,
    IOperation,
    Constants,
    openMobileFileById,
    lockScreen,
    ICard,
    ICardData
} from "siyuan";

import { appendBlock, deleteBlock, setBlockAttrs, getBlockAttrs, pushMsg, pushErrMsg, sql, renderSprig, getChildBlocks, insertBlock, renameDocByID, prependBlock, updateBlock, createDocWithMd, getDoc, getBlockKramdown, getBlockDOM } from "./api";
import "@/index.scss";

import SettingExample from "@/setting-example.svelte";

import { SettingUtils } from "./libs/setting-utils";
import { svelteDialog } from "./libs/dialog";

const STORAGE_NAME = "config";

export default class DocTreeFocusPlugin extends Plugin {

    private settingUtils: SettingUtils;
    private currentFocusedDocId: string = null;

    async onload() {
        // Add CSS style for hiding non-focused documents
        const style = document.createElement("style");
        style.id = "doctree-focus-style";
        style.innerHTML = `
            .file-tree .doctree-hidden {
                display: none !important;
            }
            .file-tree .doctree-focused {
                padding-left: 8px !important;
            }
            .file-tree .doctree-focused > .b3-list-item__toggle {
                left: -8px;
            }
            [data-type="exit-focus"] {
                margin-right: 4px;
                color: var(--b3-theme-primary);
            }
            [data-type="exit-focus"]:hover {
                color: var(--b3-theme-on-surface);
            }
        `;
        document.head.appendChild(style);

        // Register event listener for document tree right-click menu
        this.eventBus.on("open-menu-doctree", this.addDocFocusButton.bind(this));

        // Listen for click events to handle exit focus button
        this.eventBus.on("click-docicon", this.handleDocIconClick.bind(this));
    }

    onLayoutReady() {
        // Initialize any required settings
    }

    async onunload() {
        console.log("onunload");
        // Remove the style element when plugin is unloaded
        const styleElement = document.getElementById("doctree-focus-style");
        if (styleElement) {
            styleElement.remove();
        }
        // Remove focus if active
        this.exitFocusMode();
    }

    uninstall() {
        console.log("uninstall");
    }

    // Add focus option to the document tree right-click menu
    private async addDocFocusButton({ detail }: any) {
        const elements = detail.elements;
        if (!elements || !elements.length) {
            return;
        }

        // Get the first selected document element
        const docElement = elements[0];
        const docId = docElement.getAttribute("data-node-id");

        if (!docId) return;

        // Add focus option to the menu
        detail.menu.addItem({
            icon: "iconFocus",
            label: this.i18n.focus,
            click: () => {
                this.focusOnDocument(docId, docElement);
            }
        });
    }


    private async focusOnDocument(docId: string, docElement: HTMLElement) {
        // Store the current focused document ID
        this.currentFocusedDocId = docId;

        // Get all document elements in the file tree
        const allDocElements = document.querySelectorAll(".file-tree .b3-list-item");

        // Mark all documents as hidden
        allDocElements.forEach(el => {
            el.classList.add("doctree-hidden");
        });

        // Show the selected document and mark it as focused
        docElement.classList.remove("doctree-hidden");
        docElement.classList.add("doctree-focused");

        // Show all child documents
        const childDocs = Array.from(docElement.nextElementSibling?.querySelectorAll(".b3-list-item") || []);
        childDocs.forEach(el => {
            el.classList.remove("doctree-hidden");
        });

        // Expand the document if it has children
        // const toggleElement = docElement.querySelector(".b3-list-item__toggle");
        // const arrowSvg = toggleElement?.querySelector("svg");
        // if (toggleElement && arrowSvg && !arrowSvg.classList.contains("b3-list-item__arrow--open")) {
        //     (toggleElement as HTMLElement).click();
        // }


        // Add exit focus button
        this.addExitFocusButton();

        // Show success message
        showMessage(this.i18n.focusEnabled, 3000);
    }

    private addExitFocusButton() {
        // Find the document's icon container
        const docIconContainer = document.querySelector(`.file-tree.sy__file > .block__icons`);
        if (!docIconContainer) return;

        // Check if the exit focus button already exists
        if (docIconContainer.querySelector('[data-type="exit-focus"]')) return;

        // Create the exit focus button
        const exitButton = document.createElement("span");
        exitButton.setAttribute("data-type", "exit-focus");
        exitButton.className = "block__icon";
        exitButton.innerHTML = '<svg class="icon"><use xlink:href="#iconBack"></use></svg>';
        exitButton.title = this.i18n.exitFocus;

        // Add click event listener to exit focus mode
        exitButton.addEventListener("click", () => {
            this.exitFocusMode();
        });

        // Insert the button before the focus button
        const focusButton = docIconContainer.querySelector('[data-type="focus"]');
        if (focusButton) {
            docIconContainer.insertBefore(exitButton, focusButton);
        } else {
            docIconContainer.prepend(exitButton);
        }
    }

    private exitFocusMode() {
        if (!this.currentFocusedDocId) return;

        // Remove hidden class from all documents
        const allDocElements = document.querySelectorAll(".file-tree .b3-list-item");
        allDocElements.forEach(el => {
            el.classList.remove("doctree-hidden");
        });

        // Remove focused class from the focused document
        const focusedElement = document.querySelector(`.file-tree [data-node-id="${this.currentFocusedDocId}"]`);
        if (focusedElement) {
            focusedElement.classList.remove("doctree-focused");
        }

        // Find and remove the exit focus button from the document's icon container
        const docIconContainer = document.querySelector(`.file-tree.sy__file > .block__icons`);
        if (docIconContainer) {
            const exitButton = docIconContainer.querySelector('[data-type="exit-focus"]');
            if (exitButton) exitButton.remove();
        }

        this.currentFocusedDocId = null;

        // Show success message
        showMessage(this.i18n.focusDisabled, 3000);
    }
}
