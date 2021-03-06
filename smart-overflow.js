/**
 * SmartOverflow
 * @param {String} containerSelector
 * @param {String} selector
 * @param {Object} config
 * @constructor
 */
function SmartOverflow (containerSelector, selector, config) {

	this.config = this._extendConfig(config);

	this._transformCSSStyle = this._getTransformStyleDeclaration();

	this.containerElement = $(containerSelector);
	if (this.containerElement.length === 0) {
		return;
	}

	this.element = $(selector);
	if (this.element.length === 0) {
		return;
	}
	this.domElement = this.element.get(0);
	this.domElement.translateY = 0;

	this.containerElement.addClass(this.config.containerClass);
	this.element.addClass(this.config.contentClass);

	this.hasOverflowScroll = (this._hasOverflowScrolling() || this._isWindowsPhone()) && !this._isiOS();

	if (this.hasOverflowScroll) {
		this.element.addClass(this.config.hasOverflowScrollClass);
		this.containerElement.addClass(this.config.hasOverflowScrollClass);
	}

	this.attributes = this._calculateAttributes();
	this._update = this._bind(this._update, this);

	this.hasTouchEvents = this._hasTouchEvents();

	if (this.config.hasShadow) {
		this._createShadow();
	}

	if (this.config.hasThumb) {
		this._createThumb();
		if (this.config.canMoveThumb && !this.hasTouchEvents && !this._isWindowsPhone()) {
			this._bindThumbEvents();
			this.overflowMethod = 'no-touch, mouse scroll';
		}
		if (this.config.canMoveThumb && this.config.hasThumbArrows) {
			this._bindThumbArrowsEvents();
		}
	}

	this._checkContentScrolled();

	if (this.config.supportAutoRefresh) {
		this._bindContentModifiedEvent();
	}

	if (!this.hasTouchEvents && !this._isWindowsPhone()) {
		// no touch
		this.containerElement.addClass(this.config.hasNotTouchClass);
		return;
	}
	// has touch
	this.containerElement.addClass(this.config.hasTouchClass);

	if (this.hasOverflowScroll) {
		if (this.config.hasThumb) {
			this._bindScrollEvents();

			this.overflowMethod = 'touch, native scroll + onscroll events';
		}
		return;
	}

	this._bindTouchEvents();

	this.overflowMethod = 'touch, touch scroll';
}

SmartOverflow.prototype = {

	/**
	 * Configuration
	 * @type {Object}
	 */
	config: {
		containerClass: "so-container",
		contentClass: "so-content",
		hasTouchClass: "so-touch",
		hasOverflowScrollClass: "so-overflow-scroll",
		hasNotTouchClass: "so-no-touch",
		onTopClass: "so-on-top",
		onBottomClass: "so-on-bottom",
		supportAutoRefresh: true,
		nonAutoRefreshClass: "so-non-auto-refresh",
		linearAnimateClass: "so-linear-animate",
		inertiaAnimateClass: "so-inertia-animate",

		hasThumb: true,
		fixedThumbHeight: null,
		hasThumbTrack: true,
		hasThumbArrows: true,
		thumbArrowHeight: 15,
		thumbArrowStep: 0.1, // 10% of content
		autoThumbVisible: true,
		canMoveThumb: true,
		thumbClass: "so-thumb",
		thumbTrackClass: "so-thumb-track",
		thumbArrowTopClass: "so-thumb-arrow so-thumb-arrow-top",
		thumbArrowBottomClass: "so-thumb-arrow so-thumb-arrow-bottom",

		hasShadow: true,
		shadowTopClass: "so-shadow so-shadow-top",
		shadowBottomClass: "so-shadow so-shadow-bottom",

		inertia: 2
	},

	/**
	 * Cache of attributes
	 * @type {Object}
	 */
	attributes: {
		_solved: false,
		elementHeight: 0,

		scrollSpace: 0,
		scrollHeight: 0,
		scrollTop: 0,

		thumbArrowStep: 0,
		thumbArrowHeight: 0,
		thumbHeight: 0,
		thumbSpace: 0,
		thumbRatio: 0,

		isTopHidden: false,
		isBottomHidden: false
	},

	/**
	 * Element with "overflow: auto;"
	 * @type {Object}
	 */
	element: null,

	/**
	 * DOM element with "overflow: auto;"
	 * @type {Object}
	 */
	domElement: null,

	/**
	 * Parent container
	 * @type {Object}
	 */
	containerElement: null,

	/**
	 * Thumb element
	 * @type {Object}
	 */
	elementThumb: null,

	/**
	 * Thumb track element
	 * @type {Object}
	 */
	elementThumbTrack: null,

	/**
	 * Thumb arrow top element
	 * @type {Object}
	 */
	elementThumbArrowTop: null,

	/**
	 * Thumb arrow bottom element
	 * @type {Object}
	 */
	elementThumbArrowBottom: null,

	/**
	 * Top shadow element
	 * @type {Object}
	 */
	elementShadowTop: null,

	/**
	 * Bottom shadow element
	 * @type {Object}
	 */
	elementShadowBottom: null,

	/**
	 * Has touch events?
	 * @type {Boolean}
	 */
	hasTouchEvents: false,

	/**
	 * Has native overflow scroll?
	 * @type {Boolean}
	 */
	hasOverflowScroll: false,

	/**
	 * Overflow method in SmartOverflow
	 * @type {String}
	 */
	overflowMethod: 'none',

	/**
	 * Extend client config
	 * @param {Object} config
	 * @return {Object}
	 * @private
	 */
	_extendConfig: function (config) {
		var extendedConfig = {};
		for (var i in this.config) {
			if (!this.config.hasOwnProperty(i)) {
				continue;
			}
			if (!config || typeof config[i] === 'undefined') {
				extendedConfig[i] = this.config[i];
				continue;
			}
			extendedConfig[i] = config[i];
		}
		return extendedConfig;
	},

	/**
	 * Calculate attributes to cache them
	 * @return {Object}
	 * @private
	 */
	_calculateAttributes: function () {
		var attributes = (this.attributes._solved)? this.attributes : {_solved: true};
		if (!this.element || !this.domElement) {
			return this.attributes;
		}

		attributes.elementHeight = this.containerElement.height();
		attributes.scrollHeight = this.domElement.scrollHeight;
		attributes.scrollSpace = attributes.scrollHeight - attributes.elementHeight;
		attributes.scrollTop = attributes.scrollTop || 0;
		attributes.scrollTimeStamp = attributes.scrollTimeStamp || 0;
		attributes.scrollTimeStampLast = attributes.scrollTimeStampLast || 0;
		if (!this.config.hasThumb) {
			return attributes;
		}
		attributes.thumbArrowHeight = 0;
		if (this.config.hasThumbArrows) {
			var arrowHeight = (this.elementThumbArrowTop)? this.elementThumbArrowTop.height() : this.config.thumbArrowHeight;
			attributes.thumbArrowHeight = arrowHeight || this.config.thumbArrowHeight;
			attributes.thumbArrowStep = this.config.thumbArrowStep * attributes.scrollHeight;
		}
		if (this.config.fixedThumbHeight) {
			attributes.thumbHeight = this.config.fixedThumbHeight;
		}
		else {
			attributes.thumbHeight = Math.round((attributes.elementHeight - attributes.thumbArrowHeight) * (attributes.elementHeight - attributes.thumbArrowHeight) / attributes.scrollHeight);
		}
		attributes.thumbSpace = attributes.elementHeight - attributes.thumbHeight - 2 * attributes.thumbArrowHeight;
		attributes.thumbRatio = this._truncateValue(attributes.thumbSpace / attributes.scrollSpace, 0, 1);
		return attributes;
	},

	/**
	 * Update state
	 * @private
	 */
	_update: function () {
		if (this.attributes.scrollTimeStamp < this.attributes.scrollTimeStampLast) {
			return;
		}
		this.scrollTimeStampLast = this.scrollTimeStamp;

		// thumb
		if (this.elementThumb && this.elementThumb.length) {
			this.elementThumb.get(0).style[this._transformCSSStyle] = 'translateY(' + this._truncateValue(this.attributes.scrollTop * this.attributes.thumbRatio, 0, this.attributes.thumbSpace) + 'px)';
		}

		this._checkContentScrolled();
	},

	/**
	 * Has content overflow?
	 * @return {Boolean}
	 * @private
	 */
	_hasContentOverflow: function () {
		return (this.attributes.scrollHeight > this.attributes.elementHeight);
	},

	/**
	 * Check content overflow
	 * @private
	 */
	_checkContentOverflow: function () {
		this._onContentOverflowChanged(this._hasContentOverflow());
	},

	/**
	 * Check scrolled content state
	 * @private
	 */
	_checkContentScrolled: function () {
		if (!this.attributes.isTopHidden && this.attributes.scrollTop > 0) {
			this._onNonTopOfContent();
		}
		else if (this.attributes.scrollTop === 0) {
			this._onTopOfContent();
		}

		if (!this.attributes.isBottomHidden && this.attributes.scrollTop < this.attributes.scrollSpace) {
			this._onNonBottomOfContent();
		}
		else if (this.attributes.scrollTop >= this.attributes.scrollSpace) {
			this._onBottomOfContent();
		}
	},

	/**
	 * Event: onTopOfContent
	 * @private
	 */
	_onTopOfContent: function () {
		this._changeShadowVisible(false, null);
		this._changeScrollingContentState(false, null);
		this.containerElement.addClass(this.config.onTopClass);
	},

	/**
	 * Event: onBottomOfContent
	 * @private
	 */
	_onBottomOfContent: function () {
		this._changeShadowVisible(null, false);
		this._changeScrollingContentState(null, false);
		this.containerElement.addClass(this.config.onBottomClass);
	},

	/**
	 * Event: onNonTopOfContent
	 * @private
	 */
	_onNonTopOfContent: function () {
		this._changeShadowVisible(true, null);
		this._changeScrollingContentState(true, null);
		this.containerElement.removeClass(this.config.onTopClass);
	},

	/**
	 * Event: onNonBottomOfContent
	 * @private
	 */
	_onNonBottomOfContent: function () {
		this._changeShadowVisible(null, true);
		this._changeScrollingContentState(null, true);
		this.containerElement.removeClass(this.config.onBottomClass);
	},

	/**
	 * Event: onContentOverflowChanged
	 * @param {Boolean} hasOverflow
	 * @private
	 */
	_onContentOverflowChanged: function (hasOverflow) {
		this._onContentOverflowWithThumbChanged(hasOverflow);
		this._onContentOverflowWithShadowChanged(hasOverflow);
	},

	/**
	 * Event: onContentOverflowWithThumbChanged
	 * @param {Boolean} hasOverflow
	 * @private
	 */
	_onContentOverflowWithThumbChanged: function (hasOverflow) {
		if (!this.config.hasThumb) {
			return;
		}

		if (this.config.autoThumbVisible) {
			this._changeThumbVisible(hasOverflow);
		}
		else {
			this._changeThumbVisible(true);
		}
	},

	/**
	 * Event: onContentOverflowWithShadowChanged
	 * @param {Boolean} hasOverflow
	 * @private
	 */
	_onContentOverflowWithShadowChanged: function (hasOverflow) {
		if (this.config.hasShadow && !hasOverflow) {
			this._changeShadowVisible(false, false);
		}
	},

	/**
	 * Change thumb visible
	 * @param {Boolean} isVisible
	 * @private
	 */
	_changeThumbVisible: function (isVisible) {
		if (!this.config.hasThumb) {
			return;
		}
		if (isVisible) {
			this.elementThumb.show();
			this.elementThumbTrack && this.elementThumbTrack.show();
			this.elementThumbArrowTop && this.elementThumbArrowTop.show();
			this.elementThumbArrowBottom && this.elementThumbArrowBottom.show();
		}
		else {
			this.elementThumb.hide();
			this.elementThumbTrack && this.elementThumbTrack.hide();
			this.elementThumbArrowTop && this.elementThumbArrowTop.hide();
			this.elementThumbArrowBottom && this.elementThumbArrowBottom.hide();
		}
	},

	/**
	 * Change shadow visible
	 * @param {Boolean|null} isTopShadowVisible
	 * @param {Boolean|null} isBottomShadowVisible
	 * @private
	 */
	_changeShadowVisible: function (isTopShadowVisible, isBottomShadowVisible) {
		if (!this.config.hasShadow) {
			return;
		}
		// top shadow
		if (isTopShadowVisible) {
			this.elementShadowTop.css('opacity', '1');
		}
		else if (isTopShadowVisible != null) {
			this.elementShadowTop.css('opacity', '0');
		}

		// bottom shadow
		if (isBottomShadowVisible) {
			this.elementShadowBottom.css('opacity', '1');
		}
		else if (isBottomShadowVisible != null) {
			this.elementShadowBottom.css('opacity', '0');
		}
	},

	/**
	 * Change scrolling content state
	 * @param {Boolean|null} isTopHidden
	 * @param {Boolean|null} isBottomHidden
	 * @private
	 */
	_changeScrollingContentState: function (isTopHidden, isBottomHidden) {
		if (isTopHidden != null) {
			this.attributes.isTopHidden = isTopHidden;
		}
		if (isBottomHidden != null) {
			this.attributes.isBottomHidden = isBottomHidden;
		}
	},

	/**
	 * Get transform style declaration
	 * @return {String}
	 * @private
	 */
	_getTransformStyleDeclaration: function () {
		var transform = 'transform';
		if (typeof document.documentElement.style.transform != 'undefined') {
			return transform;
		}
		if (typeof document.documentElement.style.webkitTransform != 'undefined') {
			return '-webkit-' + transform;
		}
		if (typeof document.documentElement.style.MozTransform != 'undefined') {
			return '-moz-' + transform;
		}
		if ((/MSIE/gi).test(navigator.appVersion)) {
			return '-ms-' + transform;
		}
		if (typeof document.documentElement.style.OTransform != 'undefined') {
			return '-o-' + transform;
		}
		return transform;
	},

	/**
	 * Has touch events?
	 * @return {Boolean}
	 * @private
	 */
	_hasTouchEvents: function () {
		return ("ontouchmove" in document);
	},

	/**
	 * Has native overflow scrolling?
	 * @return {Boolean}
	 * @private
	 */
	_hasOverflowScrolling: function () {
		return ("WebkitOverflowScrolling" in document.documentElement.style)
			|| (/Android(.)*Chrome/.test(navigator.userAgent));
	},

	/**
	 * Is windows phone?
	 * @return {Boolean}
	 * @private
	 */
	_isWindowsPhone: function () {
		return ((/MSIE.*(IEMobile|ZuneWP)/gi).test(navigator.appVersion));
	},

	/**
	 * Is iOS?
	 * @return {Boolean}
	 */
	_isiOS: function () {
		return ((/iphone|ipad/gi).test(navigator.appVersion));
	},

	/**
	 * Add shadow
	 * @private
	 */
	_createShadow: function () {
		var shadowTop = $(
				document.createElement("div")
			).addClass(this.config.shadowTopClass),
			shadowBottom = $(
				document.createElement("div")
			).addClass(this.config.shadowBottomClass);

		this.elementShadowTop = shadowTop;
		this.elementShadowBottom = shadowBottom;

		this._onContentOverflowWithShadowChanged(this._hasContentOverflow());

		shadowTop.appendTo(this.containerElement);
		shadowBottom.appendTo(this.containerElement);
	},

	/**
	 * Add thumb
	 * @private
	 */
	_createThumb: function () {
		if (this.config.hasThumbTrack) {
			var thumbTrack = $(document.createElement("div")).addClass(this.config.thumbTrackClass);

			this.elementThumbTrack = thumbTrack;
			thumbTrack.appendTo(this.containerElement);
		}
		if (this.config.hasThumbArrows) {
			var thumbArrowTop = $(document.createElement("div")).addClass(this.config.thumbArrowTopClass),
				thumbArrowBottom = $(document.createElement("div")).addClass(this.config.thumbArrowBottomClass);

			this.elementThumbArrowTop = thumbArrowTop;
			thumbArrowTop.appendTo(this.containerElement);

			this.elementThumbArrowBottom = thumbArrowBottom;
			thumbArrowBottom.appendTo(this.containerElement);

			this.attributes = this._calculateAttributes();
		}
		var thumb = $(
			document.createElement("div")
		).addClass(this.config.thumbClass)
			.css("height", this.attributes.thumbHeight);

		if (this.config.hasThumbArrows) {
			thumb.css('top', this.elementThumbArrowTop.height());
		}

		this.elementThumb = thumb;

		this._onContentOverflowWithThumbChanged(this._hasContentOverflow());

		thumb.appendTo(this.containerElement);
	},

	/**
	 * Bind touch events
	 * @private
	 */
	_bindTouchEvents: function () {
		var scrollStartPos = 0,
			element = this.element,
			container = element,
			timeStampStart = 0,
			timeStampMove = 0,
			self = this,
			isPreventingTouchMoveEvent = this._isiOS() || this._isWindowsPhone(),
			inertia = this.config.inertia || 0,
			devicePixelRatio = window.devicePixelRatio || 1;

		container.addClass(this.config.inertiaAnimateClass);

		element.css('height', 'auto');

		element.on("touchstart.so", function (event) {
			event = event.originalEvent;
			timeStampStart = event.timeStamp;
			timeStampMove = timeStampStart;

			var value = event.touches[0].pageY * devicePixelRatio;
			scrollStartPos = this.translateY + value;

			this.scrollLast = this.translateY;
			container.addClass(self.config.linearAnimateClass);
		});

		element.on("touchmove.so", function (event) {
			event = event.originalEvent;
			var value = scrollStartPos - event.touches[0].pageY * devicePixelRatio;

			if ((event.timeStamp - timeStampMove >= 100) || (Math.abs(value - this.translateY) >= 20 * devicePixelRatio)) {
				self.scroll(value, event.timeStamp, true);

				this.scrollSpeed = -(this.translateY - this.scrollLast);
				this.scrollLast = this.translateY;
				timeStampMove = event.timeStamp;
			}

			if (!isPreventingTouchMoveEvent) {
				return;
			}
			event.preventDefault();
		});

		element.on("touchend.so", function (event) {
			container.removeClass(self.config.linearAnimateClass);
			event = event.originalEvent;
			if (event.timeStamp - timeStampStart <= 150) {
				// tap event
				return;
			}

			var value = this.translateY - (this.scrollSpeed * inertia);
			self.scroll(value, event.timeStamp, true);

			event.preventDefault();
		});
	},

	/**
	 * Bind thumb's events
	 * @private
	 */
	_bindThumbEvents: function () {
		var scrollStartPos = 0,
			elementThumb = this.elementThumb,
			domElement = this.domElement,
			isClicked = false;

		elementThumb.attr('onDragStart', 'return false;');

		var self = this,
			attributes = this.attributes,
			container = this.containerElement,
			elementOffsetTop = container.offset().top;

		elementThumb.on("mousedown.so", function (event) {
			isClicked = true;
			event = event.originalEvent;
			var value = (event.pageY - elementOffsetTop) / attributes.thumbRatio;
			scrollStartPos = domElement.translateY - value;
			container.addClass('so-linear-animate');
			event.preventDefault();
		});

		$(document).on("mousemove.so", function (event) {
			if (!isClicked) {
				return;
			}
			event = event.originalEvent;
			if (event.timeStamp - attributes.scrollTimeStamp < 100) {
				return;
			}

			var value = (event.pageY - elementOffsetTop) / attributes.thumbRatio;

			self.scroll(scrollStartPos + value, event.timeStamp, true);

			event.preventDefault();

		});

		$(document).on("mouseup.so", function (event) {
			container.removeClass('so-linear-animate');
			isClicked = false;
			event.preventDefault();
		});
	},

	/**
	 * Bind thumb arrow events
	 * @private
	 */
	_bindThumbArrowsEvents: function () {
		var thumbArrowTop = this.elementThumbArrowTop,
			thumbArrowBottom = this.elementThumbArrowBottom,
			attributes = this.attributes,
			self = this;

		thumbArrowTop.on("click.so", function (event) {
			self.scroll(attributes.scrollTop - attributes.thumbArrowStep, event.timeStamp, true);
		});

		thumbArrowBottom.on("click.so", function (event) {
			self.scroll(attributes.scrollTop + attributes.thumbArrowStep, event.timeStamp, true);
		});
	},

	/**
	 * Bind content modified event
	 * @private
	 */
	_bindContentModifiedEvent: function () {
		var self = this;
		if (this.element.hasClass(this.config.nonAutoRefreshClass)) {
			return;
		}
		this.element.on('DOMSubtreeModified.so', function (event) {
			self.refresh();
		});
	},

	/**
	 * Bind scroll events
	 * @private
	 */
	_bindScrollEvents: function () {
		var self = this,
			attributes = this.attributes;

		this.element.on("scroll.so", function (event) {
			attributes.scrollTimeStamp = event.timeStamp;
			attributes.scrollTop = this.scrollTop;

			this.translateY = attributes.scrollTop;
			self._update();
		});
	},

	/**
	 * Format string
	 * @param {String} string
	 * @param {String[]} args
	 * @return {String}
	 * @private
	 */
	_format: function (string, args) {
		var pattern = /\{\d+\}/g;
		return string.replace(pattern, function(capture){return args[capture.match(/\d+/)];});
	},

	/**
	 * Bind
	 * @param {Function} fn
	 * @param {Object} context
	 * @param {.} param
	 * @return {Function}
	 * @private
	 */
	_bind: function (fn, context, param) {
		return function() {
			return fn.call(context, param);
		};
	},

	/**
	 * Truncate value
	 * @param {Number} value
	 * @param {Number} min
	 * @param {Number} max
	 * @return {Number}
	 * @private
	 */
	_truncateValue: function (value, min, max) {
		if (value < min) {
			return min;
		}
		if (value > max) {
			return max;
		}
		return value;
	},

	/**
	 * Get SmartOverflow's overflow method
	 * @return {*}
	 */
	getOverflowMethod: function () {
		return this.overflowMethod;
	},

	/**
	 * Scroll
	 * @param {Number} value
	 * @param {Number} timeStamp
	 * @param {Boolean} shouldUpdate
	 */
	scroll: function (value, timeStamp, shouldUpdate) {
		value = this._truncateValue(value, 0, this.attributes.scrollSpace);
		if (value === this.attributes.scrollTop) {
			return;
		}

		this.domElement.style[this._transformCSSStyle] = 'translateY(-' + value + 'px)';
		this.domElement.translateY = value;

		this.attributes.scrollTop = value;
		this.attributes.scrollTimeStamp = timeStamp || (new Date()).getTime();

		if (shouldUpdate === false) {
			return;
		}

		this._update();
	},

	/**
	 * Refresh elements and attributes
	 */
	refresh: function (value) {
		this.attributes = this._calculateAttributes();

		// thumb
		if (this.config.hasThumb) {
			this.elementThumb.css("height", this.attributes.thumbHeight);
		}

		// shadow
		if (this.config.hasShadow) {

		}

		this._checkContentOverflow();

		if (typeof value != 'undefined') {
			if (this.hasOverflowScroll) {
				this.domElement.scrollTop = 0;
			}
			this.scroll(0, (new Date()).getTime(), true);
		}
		else {
			this._update();
		}
	},

	/**
	 * Destroy
	 */
	destroy: function () {
		if (!this.element) {
			return;
		}
		this.element.off(".so");
		if (this.config.hasThumb) {
			if (this.config.canMoveThumb) {
				$(document).off(".so");
				this.elementThumb && this.elementThumb.off(".so");
			}
			this.elementThumb && this.elementThumb.remove();
			this.elementThumbTrack && this.elementThumbTrack.remove();

			if (this.config.hasThumbArrows) {
				this.elementThumbArrowTop.off(".so");
				this.elementThumbArrowBottom.off(".so");
				this.elementThumbArrowTop.remove();
				this.elementThumbArrowBottom.remove();
			}
		}
		if (this.config.hasShadow) {
			this.elementShadowTop && this.elementShadowTop.remove();
			this.elementShadowBottom && this.elementShadowBottom.remove();
		}
	},

	/**
	 * Is container at top of content?
	 * @return {Boolean}
	 */
	isAtTop: function () {
		return (this.attributes.isTopHidden === false);
	},

	/**
	 * Is container at bottom of content?
	 * @return {Boolean}
	 */
	isAtBottom: function () {
		return (this.attributes.isBottomHidden === false);
	}
};