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
            .file-tree.sy__file .doctree-hidden {
                display: none !important;
            }

            /* Reset toggle padding for focused document and its children */
            .file-tree.sy__file li[data-node-id].doctree-focused>.b3-list-item__toggle {
                padding-left: 0 !important;
            }
            /* Set incremental padding for nested levels */
            .file-tree.sy__file li[data-node-id].doctree-focused + ul > li> .b3-list-item__toggle {
                padding-left: 18px !important;
            }
            .file-tree.sy__file li[data-node-id].doctree-focused + ul > li + ul > li> .b3-list-item__toggle {
                padding-left: 36px !important;
            }
            .file-tree.sy__file li[data-node-id].doctree-focused + ul > li + ul > li + ul > li> .b3-list-item__toggle {
                padding-left: 54px !important;
            }
            .file-tree.sy__file li[data-node-id].doctree-focused + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 72px !important;
            }
            .file-tree.sy__file li[data-node-id].doctree-focused + ul > li + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 90px !important;
            }
            .file-tree.sy__file li[data-node-id].doctree-focused + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 108px !important;
            }
            .file-tree.sy__file li[data-node-id].doctree-focused + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 126px !important;
            }
            .file-tree.sy__file li[data-node-id].doctree-focused + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 144px !important;
            }
            .file-tree.sy__file li[data-node-id].doctree-focused + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 162px !important;
            }
            [data-type="exit-focus"] {
                margin-right: 4px;
                color: var(--b3-theme-primary);
            }
            [data-type="exit-focus"]:hover {
                color: var(--b3-theme-on-surface);
            }
            
            /* Hide focus, collapse and more buttons when in focus mode */
            .doctree-focus-active [data-type="focus"],
            .doctree-focus-active [data-type="collapse"],
            .doctree-focus-active [data-type="more"] {
                display: none !important;
            }



        `;
        document.head.appendChild(style);

        // Register event listener for document tree right-click menu
        this.eventBus.on("open-menu-doctree", this.addDocFocusButton.bind(this));




    }

    async onLayoutReady() {
        // Initialize any required settings
        // Load saved focus state
        await this.loadFocusState();
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

        // Get the first selected element
        const element = elements[0];

        // Check if it's a notebook or a document
        const isNotebook = element.getAttribute("data-type") === "navigation-root";
        const docId = element.getAttribute("data-node-id");

        // Add focus option to the menu for both notebooks and documents
        detail.menu.addItem({
            icon: "iconFocus",
            label: this.i18n.focus,
            click: () => {
                if (isNotebook) {
                    this.focusOnNotebook(element);
                } else if (docId) {
                    this.focusOnDocument(docId, element);
                }
            }
        });
    }

    // New method to focus on notebook
    private async focusOnNotebook(notebookElement: HTMLElement) {
        // Store the current focused element
        this.currentFocusedDocId = "notebook:" + notebookElement.parentElement.getAttribute("data-url");

        // Get the parent UL which contains all notebooks
        const notebookParent = notebookElement.parentElement;

        // Get all notebook ul elements in the file tree
        const allNotebookUls = document.querySelectorAll(".file-tree.sy__file ul[data-url]");

        // Mark all notebook ULs as hidden except the one that belongs to the selected notebook
        allNotebookUls.forEach(el => {
            // Check if this is the UL of the selected notebook
            if (el.getAttribute("data-url") !== notebookElement.getAttribute("data-url")) {
                el.classList.add("doctree-hidden");
            }
        });

        // Make sure the notebooks list itself remains visible
        if (notebookParent) {
            notebookParent.classList.remove("doctree-hidden");
        }

        // Mark the selected notebook as focused
        notebookElement.classList.add("doctree-focused");

        // Add doctree-focus-active class to the file tree to hide specific buttons
        const fileTree = document.querySelector('.file-tree.sy__file');
        if (fileTree) {
            fileTree.classList.add('doctree-focus-active');
        }

        // Add exit focus button
        this.addExitFocusButton();

        // Save the focused notebook ID to persistent storage
        await this.saveData(STORAGE_NAME, { focusedDocId: this.currentFocusedDocId });

        // Show success message
        // showMessage(this.i18n.focusEnabled, 3000);
    }

    private async loadFocusState() {
        const savedData = await this.loadData(STORAGE_NAME);
        console.log("Saved data", savedData);
        if (savedData && savedData.focusedDocId) {
            // Check if the saved focus is for a notebook or document
            const isNotebook = savedData.focusedDocId.startsWith("notebook:");

            if (isNotebook) {
                // Handle notebook focus restoration
                const notebookUrl = savedData.focusedDocId.substring("notebook:".length);
                await this.waitForElement(`.file-tree.sy__file ul[data-url="${notebookUrl}"]`);

                const notebookElement = document.querySelector(`.file-tree.sy__file ul[data-url="${notebookUrl}"]>li[data-type="navigation-root"]`);
                if (notebookElement) {
                    this.focusOnNotebook(notebookElement as HTMLElement);
                }
            } else {
                // Handle document focus restoration (existing code)
                await this.waitForElement(`.file-tree.sy__file li[data-node-id="${savedData.focusedDocId}"]`);
                const docElement = document.querySelector(`.file-tree.sy__file li[data-node-id="${savedData.focusedDocId}"]`);
                if (docElement) {
                    this.focusOnDocument(savedData.focusedDocId, docElement as HTMLElement);
                }
            }
        }
    }

    /**
     * Helper function to wait for an element to appear in the DOM
     * @param selector CSS selector of the element to wait for
     * @param timeout Optional timeout in milliseconds (default: 10000)
     * @returns Promise that resolves when the element is found
     */
    private waitForElement(selector: string, timeout: number = 10000): Promise<Element> {
        return new Promise((resolve, reject) => {
            // Check if element already exists
            const element = document.querySelector(selector);
            if (element) {
                return resolve(element);
            }

            // Set a timeout for rejection
            const timeoutId = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);

            // Create a mutation observer to watch for DOM changes
            const observer = new MutationObserver((mutations) => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(element);
                }
            });

            // Start observing the document
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    private async focusOnDocument(docId: string, docElement: HTMLElement) {
        const focusedElements = document.querySelectorAll(".file-tree.sy__file li.doctree-focused");
        focusedElements.forEach(el => {
            el.classList.remove("doctree-focused");
        });

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

        // Change tooltip direction for more-file and new buttons in focused document
        const moreFileBtn = docElement.querySelector('[data-type="more-file"]');
        const newBtn = docElement.querySelector('[data-type="new"]');
        const popoverBtn = docElement.querySelector('span.popover__block.counter');

        if (moreFileBtn && moreFileBtn.classList.contains('b3-tooltips__nw')) {
            moreFileBtn.classList.remove('b3-tooltips__nw');
            moreFileBtn.classList.add('b3-tooltips__w');
        }

        if (newBtn && newBtn.classList.contains('b3-tooltips__nw')) {
            newBtn.classList.remove('b3-tooltips__nw');
            newBtn.classList.add('b3-tooltips__w');
        }
        if (popoverBtn && popoverBtn.classList.contains('b3-tooltips__nw')) {
            popoverBtn.classList.remove('b3-tooltips__nw');
            popoverBtn.classList.add('b3-tooltips__w');
        }

        // Show all child documents
        const childDocs = Array.from(docElement.nextElementSibling?.querySelectorAll(".b3-list-item") || []);
        childDocs.forEach(el => {
            el.classList.remove("doctree-hidden");
        });

        // Add doctree-focus-active class to the file tree to hide specific buttons
        const fileTree = document.querySelector('.file-tree.sy__file');
        if (fileTree) {
            fileTree.classList.add('doctree-focus-active');
        }

        // Add exit focus button
        this.addExitFocusButton();

        // Save the focused document ID to persistent storage
        await this.saveData(STORAGE_NAME, { focusedDocId: docId });

        // Show success message
        // showMessage(this.i18n.focusEnabled, 3000);
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
        exitButton.className = "block__icon b3-tooltips b3-tooltips__sw";
        exitButton.innerHTML = '<svg class="icon"><use xlink:href="#iconBack"></use></svg>';
        exitButton.setAttribute("aria-label", this.i18n.exitFocus);

        // Add click event listener to exit focus mode
        exitButton.addEventListener("click", () => {
            this.exitFocusMode();
        });

        // Insert the button after the block__logo
        const logoElement = docIconContainer.querySelector('.block__logo');
        if (logoElement) {
            logoElement.insertAdjacentElement('afterend', exitButton);
        } else {
            // Fall back to prepending if logo not found
            docIconContainer.prepend(exitButton);
        }
    }

    private async exitFocusMode() {
        if (!this.currentFocusedDocId) return;

        // Remove hidden class from all elements in the file tree - both notebooks and documents
        const allElements = document.querySelectorAll(".file-tree.sy__file li.doctree-hidden");
        allElements.forEach(el => {
            el.classList.remove("doctree-hidden");
        });
        const focusedElements = document.querySelectorAll(".file-tree.sy__file li.doctree-focused");
        focusedElements.forEach(el => {
            el.classList.remove("doctree-focused");
        });
        const allNotebooks = document.querySelectorAll(".file-tree.sy__file ul[data-url].doctree-hidden");
        allNotebooks.forEach(el => {
            el.classList.remove("doctree-hidden");
        
            el.classList.remove("doctree-focused");
        });
        const focusedNotebooks = document.querySelectorAll(".file-tree.sy__file ul[data-url].doctree-focused");
        focusedNotebooks.forEach(el => {
            el.classList.remove("doctree-focused");
        });
            


        // Remove doctree-focus-active class from the file tree to show the buttons again
        const fileTree = document.querySelector('.file-tree.sy__file');
        if (fileTree) {
            fileTree.classList.remove('doctree-focus-active');
        }

        // Find and remove the exit focus button from the document's icon container
        const docIconContainer = document.querySelector(`.file-tree.sy__file > .block__icons`);
        if (docIconContainer) {
            const exitButton = docIconContainer.querySelector('[data-type="exit-focus"]');
            if (exitButton) exitButton.remove();
        }

        // Clear the focused document ID
        this.currentFocusedDocId = null;

        // Clear the saved focus state
        await this.saveData(STORAGE_NAME, { focusedDocId: null });

        // Show success message
        // showMessage(this.i18n.focusDisabled, 3000);
    }
}
