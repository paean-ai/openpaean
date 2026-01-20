declare module 'marked-terminal' {
    import { MarkedExtension } from 'marked';

    interface MarkedTerminalOptions {
        code?: (input: string) => string;
        blockquote?: (input: string) => string;
        html?: (input: string) => string;
        heading?: (input: string) => string;
        firstHeading?: (input: string) => string;
        hr?: () => string;
        listitem?: (input: string) => string;
        list?: (body: string, ordered: boolean) => string;
        table?: (header: string, body: string) => string;
        paragraph?: (input: string) => string;
        strong?: (input: string) => string;
        em?: (input: string) => string;
        codespan?: (input: string) => string;
        del?: (input: string) => string;
        link?: (href: string, title: string, text: string) => string;
        href?: (input: string) => string;
        text?: (input: string) => string;
        unescape?: boolean;
        emoji?: boolean;
        width?: number;
        showSectionPrefix?: boolean;
        reflowText?: boolean;
        tab?: number;
        tableOptions?: {
            chars?: Record<string, string>;
        };
    }

    export function markedTerminal(options?: MarkedTerminalOptions): MarkedExtension;
}
