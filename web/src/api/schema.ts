export type paths = {
    "/api/openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** This OpenAPI document */
        get: operations["getOpenApi"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/months/{month}/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Month totals compared with another month */
        get: operations["getMonthSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/months/{month}/entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Entries of a month with filters */
        get: operations["listEntries"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/debts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Active debts */
        get: operations["listDebts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reserves": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Reserves with progress to target */
        get: operations["listReserves"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/decisions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Decisions by status, newest first */
        get: operations["listDecisions"];
        put?: never;
        /** Propose a joint decision */
        post: operations["proposeDecision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Active members with their share of joint expenses */
        get: operations["listMembers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Active categories, optionally of one direction */
        get: operations["listCategories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Active accounts by nickname and last four digits, joint first */
        get: operations["listAccounts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/goals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Goals with progress, nearest due first */
        get: operations["listGoals"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/net-worth": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Reserves and goals minus debt balances */
        get: operations["getNetWorth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/months/{month}/split": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Who owes whom from joint expenses paid from member accounts */
        get: operations["getMonthSplit"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Audit log, newest first, with counts per author */
        get: operations["listAudit"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Record an entry */
        post: operations["createEntry"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/entries/{id}/paid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark an entry as paid */
        post: operations["markPaid"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/entries/{id}/unpaid": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Undo a payment mark, back to planned */
        post: operations["markUnpaid"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reserves/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Change the balance or target of a reserve */
        patch: operations["updateReserve"];
        trace?: never;
    };
    "/api/decisions/{id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirm a proposed decision as the caller */
        post: operations["confirmDecision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/decisions/{id}/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reject a decision proposed by another member */
        post: operations["rejectDecision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/decisions/{id}/withdraw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Withdraw a decision the caller proposed */
        post: operations["withdrawDecision"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/months/{month}/forecast": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Plan the recurring entries of a month */
        post: operations["forecastMonth"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Import batches, newest first */
        get: operations["listImports"];
        put?: never;
        /** Upload a file to import; extraction runs in the background */
        post: operations["uploadImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** One import batch with its extraction progress */
        get: operations["getImport"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}/candidates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Open candidates of an import batch */
        get: operations["listImportCandidates"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}/questions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Open questions of an import batch */
        get: operations["listImportQuestions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}/questions/{question}/answer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Answer an open question of a verified import batch */
        post: operations["answerImportQuestion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}/candidates/{candidate}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Replace the payload of an open candidate; it becomes edited and is verified again */
        patch: operations["editImportCandidate"];
        trace?: never;
    };
    "/api/imports/{id}/candidates/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Accept open candidates of a verified import batch */
        post: operations["acceptImportCandidates"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}/candidates/reject": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reject open candidates of a verified import batch */
        post: operations["rejectImportCandidates"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}/commit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Write the accepted and edited candidates of a verified import batch to the ledger */
        post: operations["commitImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/imports/{id}/close": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Close a committed import batch or abandon a draft or verified one; ledger rows stay and the uploaded file is removed */
        post: operations["closeImport"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
};
export type webhooks = Record<string, never>;
export type components = {
    schemas: {
        Money: {
            /** @description Integer cents in BRL */
            cents: string;
            /** @description Formatted as R$ 1.234,56 */
            brl: string;
        };
        Entry: {
            id: string;
            /** @description Date as YYYY-MM-DD */
            competence: string;
            /** @description Date as YYYY-MM-DD */
            dueOn: string;
            description: string;
            /** @enum {string} */
            direction: "income" | "expense";
            amount: components["schemas"]["Money"];
            category: string;
            account: string | null;
            member: string | null;
            /** @enum {string} */
            status: "planned" | "paid" | "late";
            /** @enum {string} */
            state: "paid" | "pending" | "late";
            paidOn: string | null;
            installmentNumber: number | null;
            installmentsTotal: number | null;
            /**
             * @description forecast marks entries planned from a recurring source
             * @enum {string}
             */
            origin: "manual" | "claude" | "import" | "forecast";
        };
        CategoryTotals: {
            category: string;
            count: number;
            total: components["schemas"]["Money"];
            paid: components["schemas"]["Money"];
            pending: components["schemas"]["Money"];
            late: components["schemas"]["Money"];
        };
        Side: {
            count: number;
            total: components["schemas"]["Money"];
            paid: components["schemas"]["Money"];
            pending: components["schemas"]["Money"];
            late: components["schemas"]["Money"];
            byCategory: components["schemas"]["CategoryTotals"][];
        };
        MonthSummary: {
            /** @description Date as YYYY-MM-DD */
            month: string;
            /** @description Date as YYYY-MM-DD */
            today: string;
            income: components["schemas"]["Side"];
            expenses: components["schemas"]["Side"];
            balance: components["schemas"]["Money"];
        };
        CategoryDifference: {
            category: string;
            month: components["schemas"]["Money"];
            other: components["schemas"]["Money"];
            difference: components["schemas"]["Money"];
        };
        Comparison: {
            month: components["schemas"]["MonthSummary"];
            other: components["schemas"]["MonthSummary"];
            difference: {
                income: components["schemas"]["Money"];
                expenses: components["schemas"]["Money"];
                balance: components["schemas"]["Money"];
                expensesByCategory: components["schemas"]["CategoryDifference"][];
            };
        };
        Debt: {
            id: string;
            creditor: string;
            description: string;
            member: string | null;
            account: string | null;
            principal: components["schemas"]["Money"];
            balance: components["schemas"]["Money"];
            monthlyRatePercent: string | null;
            installment: components["schemas"]["Money"] | null;
            installmentsTotal: number | null;
            installmentsPaid: number;
            installmentsRemaining: number | null;
            /** @description Date as YYYY-MM-DD */
            startsOn: string;
            /** @description Oldest unpaid installment, else a month after the last one recorded */
            nextDueOn: string | null;
        };
        Reserve: {
            id: string;
            name: string;
            account: string | null;
            balance: components["schemas"]["Money"];
            target: components["schemas"]["Money"] | null;
            missing: components["schemas"]["Money"] | null;
            progressPercent: string | null;
        };
        Decision: {
            id: string;
            title: string;
            description: string;
            amount: components["schemas"]["Money"] | null;
            /** @enum {string} */
            status: "proposed" | "confirmed" | "rejected" | "withdrawn";
            proposedBy: string;
            /** @enum {string} */
            origin: "manual" | "claude";
            confirmedBy: string[];
            awaiting: string[];
            /** Format: date-time */
            createdAt: string;
            closedAt: string | null;
        };
        Forecast: {
            /** @description Date as YYYY-MM-DD */
            month: string;
            skipped: number;
            created: components["schemas"]["Entry"][];
        };
        Member: {
            id: string;
            name: string;
            sharePercent: number;
        };
        Category: {
            id: string;
            name: string;
            /** @enum {string} */
            direction: "income" | "expense";
        };
        Account: {
            id: string;
            nickname: string;
            /** @description Last four digits only */
            lastFour: string;
            /** @description Owner; null means joint */
            member: string | null;
        };
        Goal: {
            id: string;
            name: string;
            reserve: string | null;
            target: components["schemas"]["Money"];
            saved: components["schemas"]["Money"];
            missing: components["schemas"]["Money"];
            progressPercent: string;
            dueOn: string | null;
        };
        AuditItem: {
            id: string;
            /** Format: date-time */
            at: string;
            /** @enum {string} */
            author: "member" | "claude" | "import" | "system";
            member: string | null;
            entity: string;
            entityId: string | null;
            /** @enum {string} */
            action: "create" | "update" | "close";
            subject: string | null;
            before: {
                [key: string]: unknown;
            } | null;
            after: {
                [key: string]: unknown;
            } | null;
        };
        AuditPage: {
            items: components["schemas"]["AuditItem"][];
            counts: {
                member: number;
                claude: number;
                import: number;
                system: number;
            };
            /** @description Entries written by each member themselves */
            memberCounts: {
                name: string;
                total: number;
            }[];
            /** @description Pass as before to read the next page */
            next: string | null;
        };
        SplitPart: {
            name: string;
            sharePercent: number;
            paid: components["schemas"]["Money"];
            share: components["schemas"]["Money"];
            /** @description Paid minus share; negative owes */
            balance: components["schemas"]["Money"];
        };
        Transfer: {
            from: string;
            to: string;
            amount: components["schemas"]["Money"];
        };
        Split: {
            /** @description Date as YYYY-MM-DD */
            month: string;
            /** @description Joint expenses paid from member accounts */
            total: components["schemas"]["Money"];
            members: components["schemas"]["SplitPart"][];
            transfers: components["schemas"]["Transfer"][];
        };
        NetWorth: {
            reserves: components["schemas"]["Money"];
            /** @description Goals not kept in a reserve */
            goals: components["schemas"]["Money"];
            debts: components["schemas"]["Money"];
            netWorth: components["schemas"]["Money"];
        };
        ImportBatch: {
            id: string;
            fileName: string;
            format: string;
            /** @enum {string} */
            status: "draft" | "verified" | "committed" | "closed";
            /** Format: date-time */
            createdAt: string;
            closedAt: string | null;
            inputTokens: number;
            outputTokens: number;
            /** @description Model cost in US dollars, four decimals */
            costUsd: string;
            /** @description Batch checks such as total_mismatch */
            checks: {
                code: string;
                detail?: string;
            }[];
            /** @description Chunks whose extraction failed */
            failures: {
                source: string;
                offset: number;
                reason: string;
            }[];
            /** @description Totals printed in the source */
            totals: {
                [key: string]: unknown;
            }[];
            /** @description Open candidates */
            candidates: number;
            /** @description Open candidates with at least one check */
            flagged: number;
            openQuestions: number;
            /** @description Candidates written to the ledger, kept after the batch is closed */
            committed: number;
            /** @description Extraction progress while this API process runs it; null otherwise */
            progress: {
                /** @enum {string} */
                state: "extracting" | "done" | "failed";
                /** @description Chunks extracted */
                done: number;
                /** @description Chunks planned */
                total: number;
                error: string | null;
            } | null;
        };
        ImportCandidate: {
            id: string;
            /** @enum {string} */
            kind: "entry" | "account" | "category" | "income" | "recurring_expense" | "debt" | "reserve" | "goal";
            /** @description Where in the file the candidate was read */
            source: string;
            chunk: string | null;
            confidence: string;
            /** @enum {string} */
            status: "pending" | "accepted" | "rejected" | "edited";
            /** @description Candidate fields in camelCase, amounts in integer cents */
            payload: {
                [key: string]: unknown;
            };
            checks: {
                code: string;
                detail?: string;
            }[];
            /** @description Ledger row created from this candidate when the batch was committed; its table is the kind */
            recordId: string | null;
        };
        ImportQuestion: {
            id: string;
            candidateId: string | null;
            question: string;
            options: string[];
            source: string | null;
            chunk: string | null;
            answer: string | null;
        };
        ApiError: {
            error: string;
            issues?: {
                path: string;
                message: string;
            }[];
        };
        OpenApiDocument: {
            openapi: string;
        } & {
            [key: string]: unknown;
        };
        ListEntriesResponse: components["schemas"]["Entry"][];
        ListDebtsResponse: components["schemas"]["Debt"][];
        ListReservesResponse: components["schemas"]["Reserve"][];
        ListDecisionsResponse: components["schemas"]["Decision"][];
        ListMembersResponse: components["schemas"]["Member"][];
        ListCategoriesResponse: components["schemas"]["Category"][];
        ListAccountsResponse: components["schemas"]["Account"][];
        ListGoalsResponse: components["schemas"]["Goal"][];
        CreateEntryBody: {
            /** @description Month as YYYY-MM */
            month: string;
            /** @description Date as YYYY-MM-DD */
            due_on: string;
            description: string;
            /** @enum {string} */
            direction: "income" | "expense";
            amount_cents: number;
            category: string;
            account?: string;
            /** @description Member name or joint */
            member: string;
            /** @description Date as YYYY-MM-DD */
            paid_on?: string;
        };
        MarkPaidBody: {
            /** @description Date as YYYY-MM-DD */
            paid_on?: string;
        };
        UpdateReserveBody: {
            balance_cents?: number;
            target_cents?: number;
        };
        ProposeDecisionBody: {
            title: string;
            description?: string;
            amount_cents?: number;
        };
        ListImportsResponse: components["schemas"]["ImportBatch"][];
        ListImportCandidatesResponse: components["schemas"]["ImportCandidate"][];
        ListImportQuestionsResponse: components["schemas"]["ImportQuestion"][];
        AnswerImportQuestionBody: {
            /** @description One of the options or free text; naming an existing member, account, category or reserve resolves every candidate carrying the asked name */
            answer: string;
        };
        EditImportCandidateBody: {
            /** @description Full candidate payload in camelCase, checked against the schema of its kind */
            payload: {
                [key: string]: unknown;
            };
        };
        AcceptImportCandidatesBody: {
            ids: string[];
        };
        AcceptImportCandidatesResponse: components["schemas"]["ImportCandidate"][];
        RejectImportCandidatesResponse: components["schemas"]["ImportCandidate"][];
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
};
export type Money = components['schemas']['Money'];
export type Entry = components['schemas']['Entry'];
export type CategoryTotals = components['schemas']['CategoryTotals'];
export type Side = components['schemas']['Side'];
export type MonthSummary = components['schemas']['MonthSummary'];
export type CategoryDifference = components['schemas']['CategoryDifference'];
export type Comparison = components['schemas']['Comparison'];
export type Debt = components['schemas']['Debt'];
export type Reserve = components['schemas']['Reserve'];
export type Decision = components['schemas']['Decision'];
export type Forecast = components['schemas']['Forecast'];
export type Member = components['schemas']['Member'];
export type Category = components['schemas']['Category'];
export type Account = components['schemas']['Account'];
export type Goal = components['schemas']['Goal'];
export type AuditItem = components['schemas']['AuditItem'];
export type AuditPage = components['schemas']['AuditPage'];
export type SplitPart = components['schemas']['SplitPart'];
export type Transfer = components['schemas']['Transfer'];
export type Split = components['schemas']['Split'];
export type NetWorth = components['schemas']['NetWorth'];
export type ImportBatch = components['schemas']['ImportBatch'];
export type ImportCandidate = components['schemas']['ImportCandidate'];
export type ImportQuestion = components['schemas']['ImportQuestion'];
export type ApiError = components['schemas']['ApiError'];
export type OpenApiDocument = components['schemas']['OpenApiDocument'];
export type ListEntriesResponse = components['schemas']['ListEntriesResponse'];
export type ListDebtsResponse = components['schemas']['ListDebtsResponse'];
export type ListReservesResponse = components['schemas']['ListReservesResponse'];
export type ListDecisionsResponse = components['schemas']['ListDecisionsResponse'];
export type ListMembersResponse = components['schemas']['ListMembersResponse'];
export type ListCategoriesResponse = components['schemas']['ListCategoriesResponse'];
export type ListAccountsResponse = components['schemas']['ListAccountsResponse'];
export type ListGoalsResponse = components['schemas']['ListGoalsResponse'];
export type CreateEntryBody = components['schemas']['CreateEntryBody'];
export type MarkPaidBody = components['schemas']['MarkPaidBody'];
export type UpdateReserveBody = components['schemas']['UpdateReserveBody'];
export type ProposeDecisionBody = components['schemas']['ProposeDecisionBody'];
export type ListImportsResponse = components['schemas']['ListImportsResponse'];
export type ListImportCandidatesResponse = components['schemas']['ListImportCandidatesResponse'];
export type ListImportQuestionsResponse = components['schemas']['ListImportQuestionsResponse'];
export type AnswerImportQuestionBody = components['schemas']['AnswerImportQuestionBody'];
export type EditImportCandidateBody = components['schemas']['EditImportCandidateBody'];
export type AcceptImportCandidatesBody = components['schemas']['AcceptImportCandidatesBody'];
export type AcceptImportCandidatesResponse = components['schemas']['AcceptImportCandidatesResponse'];
export type RejectImportCandidatesResponse = components['schemas']['RejectImportCandidatesResponse'];
export type $defs = Record<string, never>;
export interface operations {
    getOpenApi: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OpenApiDocument"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getMonthSummary: {
        parameters: {
            query?: {
                /** @description Month to compare with; defaults to the previous month */
                compare_with?: string;
                /** @description Reference date YYYY-MM-DD for pending and late; defaults to today in America/Sao_Paulo */
                today?: string;
            };
            header?: never;
            path: {
                /** @description Month as YYYY-MM */
                month: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Comparison"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listEntries: {
        parameters: {
            query?: {
                direction?: "income" | "expense";
                category?: string;
                /** @description Account nickname */
                account?: string;
                /** @description Member name or joint */
                member?: string;
                state?: "paid" | "pending" | "late";
                /** @description Reference date YYYY-MM-DD for pending and late; defaults to today in America/Sao_Paulo */
                today?: string;
            };
            header?: never;
            path: {
                /** @description Month as YYYY-MM */
                month: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListEntriesResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listDebts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListDebtsResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listReserves: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListReservesResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listDecisions: {
        parameters: {
            query?: {
                status?: "proposed" | "confirmed" | "rejected" | "withdrawn" | "all";
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListDecisionsResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    proposeDecision: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ProposeDecisionBody"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Decision"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listMembers: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListMembersResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listCategories: {
        parameters: {
            query?: {
                direction?: "income" | "expense";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListCategoriesResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listAccounts: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListAccountsResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listGoals: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListGoalsResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getNetWorth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NetWorth"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getMonthSplit: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Month as YYYY-MM */
                month: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Split"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listAudit: {
        parameters: {
            query?: {
                author?: "member" | "claude" | "import" | "system";
                /** @description Member name */
                member?: string;
                /** @description Table name such as entry or decision */
                entity?: string;
                /** @description Cursor: the next value of the previous page */
                before?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuditPage"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    createEntry: {
        parameters: {
            query?: {
                /** @description Reference date YYYY-MM-DD for pending and late; defaults to today in America/Sao_Paulo */
                today?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateEntryBody"];
            };
        };
        responses: {
            /** @description Created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Entry"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    markPaid: {
        parameters: {
            query?: {
                /** @description Reference date YYYY-MM-DD for pending and late; defaults to today in America/Sao_Paulo */
                today?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MarkPaidBody"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Entry"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    markUnpaid: {
        parameters: {
            query?: {
                /** @description Reference date YYYY-MM-DD for pending and late; defaults to today in America/Sao_Paulo */
                today?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Entry"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    updateReserve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Reserve name, percent-encoded */
                name: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateReserveBody"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Reserve"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    confirmDecision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Decision"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    rejectDecision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Decision"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    withdrawDecision: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Decision"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    forecastMonth: {
        parameters: {
            query?: {
                /** @description Reference date YYYY-MM-DD for pending and late; defaults to today in America/Sao_Paulo */
                today?: string;
            };
            header?: never;
            path: {
                /** @description Month as YYYY-MM */
                month: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Forecast"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listImports: {
        parameters: {
            query?: {
                status?: "draft" | "verified" | "committed" | "closed";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListImportsResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    uploadImport: {
        parameters: {
            query: {
                /** @description Confirms the member agreed that the file content is sent to the model for extraction */
                consent: "true";
            };
            header: {
                /** @description Original file name, percent-encoded; the extension sets the format */
                "x-file-name": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/octet-stream": string;
            };
        };
        responses: {
            /** @description Accepted */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportBatch"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    getImport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportBatch"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listImportCandidates: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListImportCandidatesResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    listImportQuestions: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ListImportQuestionsResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    answerImportQuestion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                question: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnswerImportQuestionBody"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportQuestion"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    editImportCandidate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                candidate: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EditImportCandidateBody"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportCandidate"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    acceptImportCandidates: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcceptImportCandidatesBody"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcceptImportCandidatesResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    rejectImportCandidates: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcceptImportCandidatesBody"];
            };
        };
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RejectImportCandidatesResponse"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    commitImport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportBatch"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    closeImport: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OK */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportBatch"];
                };
            };
            /** @description Error */
            default: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
}
