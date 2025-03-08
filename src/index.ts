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

            /* Reset toggle padding for focused document and its children */
            .file-tree .doctree-focused .b3-list-item__toggle {
                padding-left: 0 !important;
            }
            /* Set incremental padding for nested levels */
            .file-tree .doctree-focused + ul > li> .b3-list-item__toggle {
                padding-left: 18px !important;
            }
            .file-tree .doctree-focused + ul > li + ul > li> .b3-list-item__toggle {
                padding-left: 36px !important;
            }
            .file-tree .doctree-focused + ul > li+ ul > li+ ul > li> .b3-list-item__toggle {
                padding-left: 54px !important;
            }
            .file-tree .doctree-focused + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 72px !important;
            }
            .file-tree .doctree-focused + ul > li + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 90px !important;
            }
            .file-tree .doctree-focused + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 108px !important;
            }
            .file-tree .doctree-focused + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 126px !important;
            }
            .file-tree .doctree-focused + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
                padding-left: 144px !important;
            }
            .file-tree .doctree-focused + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li + ul > li > .b3-list-item__toggle {
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

    private async loadFocusState() {
        const savedData = await this.loadData(STORAGE_NAME);
        console.log("Saved data", savedData);
        if (savedData && savedData.focusedDocId) {
            // Wait for the file tree to be available in the DOM
            await this.waitForElement(`.file-tree.sy__file li[data-node-id="${savedData.focusedDocId}"]`);

            // Find the document element by ID
            const docElement = document.querySelector(`.file-tree.sy__file li[data-node-id="${savedData.focusedDocId}"]`);
            console.log(docElement);
            if (docElement) {
                // Restore the focus state
                this.focusOnDocument(savedData.focusedDocId, docElement as HTMLElement);
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
        showMessage(this.i18n.focusDisabled, 3000);
    }
}
