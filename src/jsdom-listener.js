import { gotScraping, Session, log, sleep } from 'crawlee';
// eslint-disable-next-line import/no-extraneous-dependencies
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';

// for localhost to ensure that fetched resources are from CDN, if not add proxy
class CustomResourceLoader extends ResourceLoader {
    fetch(url, options) {
        // Override the contents of this script to do something unusual.
        if (['.css', '.pnf'].find((x) => url.includes(x))) {
            return Promise.resolve(Buffer.from(''));
        }
        return super.fetch(url, options);
    }
}

const getApiUrlWithVerificationToken = async (body, url) => {
    log.info(`Getting API session`);
    const virtualConsole = new VirtualConsole();
    const { window } = new JSDOM(body, {
        url,
        contentType: 'text/html',
        runScripts: 'dangerously',
        resources: 'usable' || new CustomResourceLoader(),
        pretendToBeVisual: false,
        virtualConsole,
    });
    virtualConsole.on('error', () => {
        // ignore errors cause by fake XMLHttpRequest
    });
    // might need stubs for custom resources https://github.com/apify/crawlee/blob/f35b80501d1f926935fb75a875009a2cfabd31d5/packages/jsdom-crawler/src/internals/jsdom-crawler.ts#L232

    const apiHeaderKeys = ['anonymous-user-id', 'timestamp', 'user-sign'];
    const apiValues = {};
    let retries = 10;
    // api calls made outside of fetch, hack below is to get URL without actual call
    window.XMLHttpRequest.prototype.setRequestHeader = (name, value) => {
        if (apiHeaderKeys.includes(name)) {
            apiValues[name] = value;
        }
        if (Object.values(apiValues).length === apiHeaderKeys.length) {
            retries = 0;
        }
    };
    window.XMLHttpRequest.prototype.open = (method, urlToOpen) => {
        if (['static', 'scontent'].find((x) => urlToOpen.startsWith(`https://${x}`))) {
        }
        log.debug('urlToOpen', urlToOpen);
    };
    do {
        await sleep(4000);
        retries--;
    } while (retries > 0);

    await window.close();
    return apiValues;
};

export const createSessionFunction = async (sessionPool, proxyConfiguration) => {
    const proxyUrl = await proxyConfiguration.newUrl(Math.random().toString());
    const url = 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pad/en';
    // need url with data to generate token
    const response = await gotScraping({ url, proxyUrl });
    const headers = await getApiUrlWithVerificationToken(response.body.toString(), url);
    if (!headers) {
        throw new Error(`Token generation blocked`);
    }
    log.info(`Generated API verification headers`, Object.values(headers));
    return new Session({
        userData: {
            headers,
        },
        sessionPool,
    });
};

export const createStartUrls = (input) => {
    const {
        days = '7',
        country = '',
        resultsLimit = 100,
        industry = '',
        isNewToTop100,
    } = input;

    const filterBy = isNewToTop100 ? 'new_on_board' : '';
    return [{
        url: `https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?page=1&limit=50&period=${days}&country_code=${country}&filter_by=${filterBy}&sort_by=popular&industry_id=${industry}`,
        headers: {
           // required headers
        },
        userData: { resultsLimit },
    }];
};