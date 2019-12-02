<a name="0.0.5"></a>
## [0.0.5](https://github.com/kwonoj/webpack-loader-worker/compare/v0.0.4...v0.0.5) (2019-12-02)


### Bug Fixes

* **package:** remove redundant deps ([1c172a5](https://github.com/kwonoj/webpack-loader-worker/commit/1c172a5))


### Features

* **runtask:** remove worker if timed out ([e14730b](https://github.com/kwonoj/webpack-loader-worker/commit/e14730b))



<a name="0.0.4"></a>
## [0.0.4](https://github.com/kwonoj/webpack-loader-worker/compare/v0.0.3...v0.0.4) (2019-12-02)


### Bug Fixes

* **loaderworker:** handle completion to exit threads ([63f7adc](https://github.com/kwonoj/webpack-loader-worker/commit/63f7adc))
* **threadpool:** correct thread exit management ([ac115ba](https://github.com/kwonoj/webpack-loader-worker/commit/ac115ba))
* **transferhandler:** avoid aggressive releaseproxy ([0134342](https://github.com/kwonoj/webpack-loader-worker/commit/0134342))
* **transferhandler:** release proxy where possible ([50af906](https://github.com/kwonoj/webpack-loader-worker/commit/50af906))


### Features

* **workerentrypoint:** wait existing task before exit thread ([1465bb6](https://github.com/kwonoj/webpack-loader-worker/commit/1465bb6))



<a name="0.0.3"></a>
## [0.0.3](https://github.com/kwonoj/webpack-loader-worker/compare/v0.0.2...v0.0.3) (2019-12-01)


### Features

* **createworker:** expose thread exit interface ([2a30ea3](https://github.com/kwonoj/webpack-loader-worker/commit/2a30ea3))
* **threadpool:** reuse threadpool ([ce65887](https://github.com/kwonoj/webpack-loader-worker/commit/ce65887))
* **workerentrypoint:** allow exit thread ([b9fabed](https://github.com/kwonoj/webpack-loader-worker/commit/b9fabed))



<a name="0.0.2"></a>
## [0.0.2](https://github.com/kwonoj/webpack-loader-worker/compare/v0.0.1...v0.0.2) (2019-11-30)


### Bug Fixes

* **loader:** allow omitting options ([5b95af3](https://github.com/kwonoj/webpack-loader-worker/commit/5b95af3))



<a name="0.0.1"></a>
## 0.0.1 (2019-11-30)


### Bug Fixes

* **adapter:** do not try to transfer fn over thread ([0658afa](https://github.com/kwonoj/webpack-loader-worker/commit/0658afa))
* **loaderworker:** fix proxy marshalling ([d77397d](https://github.com/kwonoj/webpack-loader-worker/commit/d77397d))
* **logger:** use console based logger ([4c9ee4c](https://github.com/kwonoj/webpack-loader-worker/commit/4c9ee4c))


### Features

* **createworker:** adapter to create worker instance ([4fb8443](https://github.com/kwonoj/webpack-loader-worker/commit/4fb8443))
* **createworker:** allow terminate worker ([67a9fe4](https://github.com/kwonoj/webpack-loader-worker/commit/67a9fe4))
* **isworkerenabled:** utility to check worker enabled ([4a27c10](https://github.com/kwonoj/webpack-loader-worker/commit/4a27c10))
* **loader:** initial implementation ([4820b3b](https://github.com/kwonoj/webpack-loader-worker/commit/4820b3b))
* **loaderworker:** implement loaderworker ([d3740dc](https://github.com/kwonoj/webpack-loader-worker/commit/d3740dc))
* **logger:** implement basic loggert ([430474c](https://github.com/kwonoj/webpack-loader-worker/commit/430474c))
* **parallelloader:** define interfaces ([84851c3](https://github.com/kwonoj/webpack-loader-worker/commit/84851c3))
* **threadpool:** initial implementation ([96cba95](https://github.com/kwonoj/webpack-loader-worker/commit/96cba95))
* **transferhandler:** transferhandler for nodeendpoint ([3e62a93](https://github.com/kwonoj/webpack-loader-worker/commit/3e62a93))
* **workerentrypoint:** implement worker function ([dee9ed4](https://github.com/kwonoj/webpack-loader-worker/commit/dee9ed4))



