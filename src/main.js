import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

import { createSessionFunction, createStartUrls } from './jsdom-listener.js';

await Actor.init();

const input = await Actor.getInput() ?? {};
const {
    proxy = {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
    },
} = input;

const proxyConfiguration = await Actor.createProxyConfiguration(proxy);

const crawler = new CheerioCrawler({
    sessionPoolOptions: {
        maxPoolSize: 1,
        createSessionFunction: async (sessionPool) => createSessionFunction(sessionPool, proxyConfiguration),
    },
    preNavigationHooks: [
        (crawlingContext) => {
            const { request, session } = crawlingContext;
            request.headers = {
                ...request.headers,
                ...session.userData?.headers,
            };
        },
    ],
    proxyConfiguration,
    async requestHandler(context) {
        const { log, request, json } = context;
        const { userData } = request;
        const { itemsCounter = 0, resultsLimit = 0 } = userData;
        if (!json.data) {
            throw new Error('BLOCKED');
        }
        const { data } = json;
        const items = data.list;
        const counter = itemsCounter + items.length;
        const dataItems = items.slice(0, resultsLimit && counter > resultsLimit ? resultsLimit - itemsCounter : undefined);

        // Format the data as a single text string
        const textOutput = dataItems.map(item => {
            // Round video views to the nearest million
            const roundedViews = Math.round(item.video_views / 1000000);
            
            // Format the data as required
            return `${item.rank}. #${item.hashtag_name} - ${item.industry_info.label} - ${roundedViews}M`;
        }).join('\n'); // Join the items with a newline between them

        // Push the formatted text as output
        await context.pushData(textOutput);

        const { pagination: { page, total } } = data;
        log.info(`Scraped ${dataItems.length} results out of ${total} from search page ${page}`);
        const isResultsLimitNotReached = counter < Math.min(total, resultsLimit);
        if (isResultsLimitNotReached && data.pagination.has_more) {
            const nextUrl = new URL(request.url);
            nextUrl.searchParams.set('page', page + 1);
            await crawler.addRequests([{
                url: nextUrl.toString(),
                headers: request.headers,
                userData: {
                    ...request.userData,
                    itemsCounter: itemsCounter + dataItems.length,
                },
            }]);
        }
    },
});

await crawler.run(createStartUrls(input));

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit()
await Actor.exit();
