import type { ResolveRequest, ResolveResponse } from "./types.js";

export class EntityApi {

    constructor(
        private readonly endpoint: string
    ) {}

    async resolve(
        request: ResolveRequest
    ): Promise<ResolveResponse> {

        const response = await fetch(
            `${this.endpoint}/profiles/resolve`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body: JSON.stringify(request),
            }
        );

        if (!response.ok) {
            throw new Error(
                `Resolve failed: ${response.status}`
            );
        }

        return response.json();
    }
}