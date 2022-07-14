

(function(factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(['jquery', 'datatables.net'], function($) {
            return factory($, window, document);
        });
    } else if (typeof exports === 'object') {
        // CommonJS
        module.exports = function(root, $) {
            if (!root) {
                root = window;
            }

            if (!$ || !$.fn.dataTable) {
                $ = require('datatables.net')(root, $).$;
            }

            return factory($, root, root.document);
        };
    } else {
        // Browser
        factory(jQuery, window, document);
    }
}(function($, window, document, undefined) {
    'use strict';
    
    if (typeof $.fn.dataTable != "function" || typeof $.fn.dataTableExt.fnVersionCheck != "function" ||  !$.fn.dataTableExt.fnVersionCheck('1.9.3')) {
        return;
    }
    var DataTable = $.fn.dataTable;
    var _instCounter = 0;
    var ColResize = function(dt, config) {
        if (!(this instanceof ColResize)) {
            throw "ColResize must be initialised with the 'new' keyword.";
        }
        this.dt = new DataTable.Api(dt);
        var dtSettings = this.dt.settings()[0];
        this.c = $.extend(true, {}, ColResize.defaults, config === true ? {} : config);
        
        this.s = {
            dt: dtSettings,
            isMousedown : false,
            mouse : {
                startX: -1,
                targetIndex: -1,
                targetColumn: -1,
                neighbourIndex: -1,
                neighbourColumn: -1
            },
            namespace: '.dtcrs' + (_instCounter++),
            count : {
                saveState : 0
            }
        };
        
        this.dom = {
            resizeCol: null,
            resizeColNeighbour: null,
            restoreEvents: [],
            restoreTouchEvents: [],
        };

        if (dtSettings._colResize) {
            throw "ColResize already initialised on table " + dtSettings.nTable.id;
        }

        dtSettings._colResize = this;
        this._constructor();
    };


    /*
     * Variable: ColResize
     * Purpose:  Prototype for ColResize
     * Scope:    global
     */
    $.extend(ColResize.prototype, {
        reset: function () {
            for (var i = 0, iLen = this.s.dt.aoColumns.length; i < iLen; i++) {
                this.s.dt.aoColumns[i].width = this.s.dt.aoColumns[i]._ColResize_iOrigWidth;
            }
            this.dt.columns.adjust();
            return this;
        },
        
        /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
        * Private methods (they are of course public in JS, but recommended as private)
        * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

        /**
         * Constructor logic
         *  @method  _constructor
         *  @returns void
         *  @private
        */
        _constructor: function () {
            var that = this, i, iLen = this.s.dt.aoColumns.length;

            this._fnSetupListeners();

            $.each(this.s.dt.aoColumns, function (i, column) {
                $(column.nTh).attr('data-column-index', i);
            });
            for (i = 0; i < iLen; i++) {
                this.s.dt.aoColumns[i]._ColResize_iOrigWidth = this.s.dt.aoColumns[i].width;
            }

            this.s.dt.oApi._fnCallbackReg(this.s.dt, 'aoStateSaveParams', function (oS, oData) {
                that._fnStateSave.call(that, oData);
            }, "ColResize_State");

            // State loading
            this._fnStateLoad();
            this.dt.on("init.dt", function(e, settings){
                that._fnRAdjust();
            });
        },
        
        _fnStateSave: function (oState) {
            this.s.count.saveState++;
            if(this.s.count.saveState == 1){
                return;
            }
            var col = this.s.dt.aoColumns, el;
            var len = col.length;
            for(var i = 0; i < len; i++){
                oState.columns[i].width = col[i].sWidthOrig;
                el = col[i].nTh;
                if(col[i].bVisible && parseInt($(el).css("width")) > 0){
                    oState.columns[i].width = $(el).css("width");
                }
            }
        },
        
        _fnStateLoad: function () {
            var that = this,
                loadedState = this.s.dt.oLoadedState;
        
            if (loadedState && loadedState.columns) {
                var colStates = loadedState.columns,
                    currCols = this.s.dt.aoColumns;
                if (colStates.length > 0 && colStates.length === currCols.length) {
                    colStates.forEach(function (state, index) {
                        var col = that.s.dt.aoColumns[index];
                        if (state.width) {
                            col.sWidthOrig = col.sWidth = state.width;
                        }
                    });
                }
            }
        },
        
        _fnSaveState: function(){
            this.s.dt.oInstance.oApi._fnSaveState(this.s.dt);
        },
        
        _fnRAdjust : function(){
            var col = this.s.dt.aoColumns, el, re = false, domCols;
            var len = col.length;
            
            for(var i = 0; i < len; i++){
                el = col[i].nTh;
                if(col[i].bVisible && col[i].rWidth && parseInt($(el).css("width")) <= 30){
                    col[i].sWidth = col[i].sWidthOrig = col[i].rWidth;
                    domCols = $("th[data-column-index='"+i+"']", $(this.s.dt.nTableWrapper));
                    domCols.width(col[i].rWidth);
                    re = true;
                }
                else if(col[i].bVisible){
                    col[i].sWidth = $(el).css("width");
                }
            }
            if(re){
                this._fnSaveState();
            }
        },
        
        
        _fnResizeAvailable : function(e, nTh){
            var that = this;

            var ePageX = e.type.indexOf('touch') !== -1 ? e.originalEvent.touches[0].pageX : e.pageX;
            var offset = $(nTh).offset();
            var relativeX = (ePageX - offset.left);
            var distFromLeft = relativeX;
            var distFromRight = $(nTh).outerWidth() - relativeX - 1;
            
            var handleBuffer = this.c.handleWidth / 2;
            var leftHandleOn = distFromLeft < handleBuffer;
            var rightHandleOn = distFromRight < handleBuffer;

            if ($(nTh).prev("th").length == 0) {
                if (this.c.rtl)
                    rightHandleOn = false;
                else
                    leftHandleOn = false;
            }
            if ($(nTh).next("th").length == 0 && this.c.tableWidthFixed) {
                if (this.c.rtl)
                    leftHandleOn = false;
                else
                    rightHandleOn = false;
            }

            var resizeAvailable = leftHandleOn || rightHandleOn;

            if (that.c.rtl) {
                if (leftHandleOn) {
                    that.dom.resizeCol = $(nTh);
                    that.dom.resizeColNeighbour = $(nTh).next();
                } else if (rightHandleOn) {
                    that.dom.resizeCol = $(nTh).prev();
                    that.dom.resizeColNeighbour = $(nTh);
                }
            } else {
                if (rightHandleOn) {
                    that.dom.resizeCol = $(nTh);
                    that.dom.resizeColNeighbour = $(nTh).next();
                } else if (leftHandleOn) {
                    that.dom.resizeCol = $(nTh).prev();
                    that.dom.resizeColNeighbour = $(nTh);
                }
            }

            if (this.c.tableWidthFixed)
                resizeAvailable &= this.c.exclude.indexOf(parseInt($(that.dom.resizeCol).attr("data-column-index"))) == -1 && this.c.exclude.indexOf(parseInt($(that.dom.resizeColNeighbour).attr("data-column-index"))) == -1;
            else
                resizeAvailable &= this.c.exclude.indexOf(parseInt($(that.dom.resizeCol).attr("data-column-index"))) == -1;
            return resizeAvailable;
        },
        
        _fnDelayEvents: function (until, obj, type, namespace) {
            var that = this;
            var events = $._data($(obj).get(0), 'events') || [];
            $.each(events, function (i, o) {
                if (i == type) {
                    $.each(o, function (k, v) {
                        if (v) {
                            if (namespace) {
                                if (v.namespace == namespace) {
                                    $(obj).off(type + "." + namespace);
                                    that.dom.restoreEvents.push({ "until": until, "obj": obj, "type": v.type, "namespace": v.namespace, "handler": v.handler });
                                }
                            } else {
                                that.dom.restoreEvents.push({ "until": until, "obj": obj, "type": v.type, "namespace": null, "handler": v.handler });
                                $(obj).off(type);
                            }
                        }
                    });
                }
            });
        },
        
        _fnRestoreEvents: function (until) {
            var that = this;
            var i;
            for (i = that.dom.restoreEvents.length; i--;) {
                if (that.dom.restoreEvents[i].until == undefined || that.dom.restoreEvents[i].until == null || that.dom.restoreEvents[i].until == until) {
                    if (that.dom.restoreEvents[i].namespace) {
                        $(that.dom.restoreEvents[i].obj).off(that.dom.restoreEvents[i].type + "." + that.dom.restoreEvents[i].namespace).on(that.dom.restoreEvents[i].type + "." + that.dom.restoreEvents[i].namespace, that.dom.restoreEvents[i].handler);
                        that.dom.restoreEvents.splice(i, 1);
                    } else {
                        $(that.dom.restoreEvents[i].obj).off(that.dom.restoreEvents[i].type).on(that.dom.restoreEvents[i].type, that.dom.restoreEvents[i].handler);
                        that.dom.restoreEvents.splice(i, 1);
                    }
                }
            }
        },
        
        _fnDelayTouchEvents : function(until, obj, type, namespace){
            var that = this;
            var events = $._data($(obj).get(0), 'events');
            $.each(events, function (i, o) {
                if (i == type) {
                    $.each(o, function (k, v) {
                        if (v) {
                            if (namespace) {
                                if (v.namespace == namespace) {
                                    $(obj).off(type + "." + namespace);
                                    that.dom.restoreTouchEvents.push({ "until": until, "obj": obj, "type": v.type, "namespace": v.namespace, "handler": v.handler });
                                }
                            } else {
                                that.dom.restoreTouchEvents.push({ "until": until, "obj": obj, "type": v.type, "namespace": null, "handler": v.handler });
                                $(obj).off(type);
                            }
                        }
                    });
                }
            });
        },
        _fnRestoreTouchEvents : function (until) {
            var that = this;
            var i;
            for (i = that.dom.restoreTouchEvents.length; i--;) {
                if (that.dom.restoreTouchEvents[i].until == undefined || that.dom.restoreTouchEvents[i].until == null || that.dom.restoreTouchEvents[i].until == until) {
                    if (that.dom.restoreTouchEvents[i].namespace) {
                        $(that.dom.restoreTouchEvents[i].obj).off(that.dom.restoreTouchEvents[i].type + "." + that.dom.restoreTouchEvents[i].namespace).on(that.dom.restoreTouchEvents[i].type + "." + that.dom.restoreTouchEvents[i].namespace, that.dom.restoreTouchEvents[i].handler);
                        that.dom.restoreTouchEvents.splice(i, 1);
                    } else {
                        $(that.dom.restoreTouchEvents[i].obj).off(that.dom.restoreTouchEvents[i].type).on(that.dom.restoreTouchEvents[i].type, that.dom.restoreTouchEvents[i].handler);
                        that.dom.restoreTouchEvents.splice(i, 1);
                    }
                }
            }
        },
        
        /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
         * Mouse drop and drag
         */
        _fnSetupListeners: function () {
            var that = this;
            $(that.s.dt.nTableWrapper).off("mousemove.ColResize touchmove.ColResize").on("mousemove.ColResize touchmove.ColResize", "th", function (e) {
                e.preventDefault();
                
                if(that.s.isMousedown){
                }
                else if (that._fnResizeAvailable.call(that, e, this)) {
                    that._fnDelayEvents(null, this, "mousedown", "ColReorder");
                    that._fnDelayEvents("click", this, "click", "DT");
                    $(this).css("cursor", "ew-resize", "border-right", "1px dotted #cecece");
                } 
                else {
                    $(this).css("cursor", "pointer");
                    that._fnRestoreEvents();
                    that._fnRestoreEvents("click");
                }                
            });
            $(that.s.dt.nTableWrapper).off("mousedown.ColResize touchstart.ColResize").on("mousedown.ColResize touchstart.ColResize", "th", function (e) {
                var resizeAvailable = that._fnResizeAvailable.call(that, e, this);
                if(resizeAvailable){
                    if(e.type == "touchstart"){
                        that._fnDelayTouchEvents(null, document, "touchmove", "ColReorder");
                        that._fnDelayTouchEvents(null, document, "touchend", "ColReorder");
                    }
                    that._fnMouseDown.call(that, e, this);
                }
                else if(e.type == "touchstart"){
                    that._fnRestoreTouchEvents();
                }
            });
            
            $(document).off('mousemove.ColResize touchmove.ColResize').on('mousemove.ColResize touchmove.ColResize', function (e) {
                    if(that.s.isMousedown){
                        that._fnMouseMove.call(that, e);
                    }
                })
                .off('mouseup.ColResize touchend.ColResize').on('mouseup.ColResize touchend.ColResize', function (e) {
                    if(that.s.isMousedown){
                        that._fnMouseUp.call(that, e);
                    }
                });
        },
        
        _fnMouseDown: function (e, nTh) {
            var that = this;

            that.s.isMousedown = true;
            this.s.mouse.startX = e.type.indexOf('touch') !== -1 ? e.originalEvent.touches[0].pageX : e.pageX;
            var idx = parseInt(that.dom.resizeCol.attr("data-column-index"));
            if (that.dom.resizeColNeighbour[0] === undefined) {
                var idxNeighbour = 0;
            } else {
                var idxNeighbour = parseInt(that.dom.resizeColNeighbour.attr("data-column-index"));
            }

            if (idx === undefined) {
                return;
            }

            this.s.mouse.targetIndex = idx;
            this.s.mouse.targetColumn = this.s.dt.aoColumns[idx];

            this.s.mouse.neighbourIndex = idxNeighbour;
            this.s.mouse.neighbourColumn = this.s.dt.aoColumns[idxNeighbour];
        },

        _fnMouseMove: function (e) {
            var that = this;
            
            $(that.s.mouse.targetColumn.nTh).addClass("dt-col-resize");
            $(this.dt.column(that.s.mouse.targetColumn.nTh).nodes()).addClass("dt-col-resize");
            var offset = $(that.s.mouse.targetColumn.nTh).offset();
            var ePageX = e.type.indexOf('touch') !== -1 ? e.originalEvent.touches[0].pageX : e.pageX;
            var relativeX = (ePageX - offset.left);
            var distFromRight = $(that.s.mouse.targetColumn.nTh).outerWidth() - relativeX - 1;

            var dx = ePageX - that.s.mouse.startX;
            var minColumnWidth = Math.max(parseInt($(that.s.mouse.targetColumn.nTh).css('min-width')), 10);
            var prevWidth = $(that.s.mouse.targetColumn.nTh).width();
            if ((dx > 0 && distFromRight <= 0) || (dx < 0 && distFromRight >= 0)) {
                if (!that.c.tableWidthFixed) {
                    var newColWidth = Math.max(minColumnWidth, prevWidth + dx);
                    var widthDiff = newColWidth - prevWidth;
                    var colResizeIdx = parseInt(that.dom.resizeCol.attr("data-column-index"));
                    that.s.mouse.targetColumn.sWidthOrig = that.s.mouse.targetColumn.sWidth = that.s.mouse.targetColumn.width = newColWidth + "px";
                    var domCols = $(that.s.dt.nTableWrapper).find("th[data-column-index='" + colResizeIdx + "']");
                    domCols.parents("table").each(function () {
                        if (!$(this).parent().hasClass("DTFC_LeftBodyLiner")) {
                            var newWidth = $(this).width() + widthDiff;
                            $(this).width(newWidth);
                        } else {
                            var newWidth = $(that.s.dt.nTableWrapper).find(".DTFC_LeftHeadWrapper").children("table").width();
                            $(this).parents(".DTFC_LeftWrapper").width(newWidth);
                            $(this).parent().width(newWidth + 15);
                            $(this).width(newWidth);
                        }
                    });
                    domCols.width(that.s.mouse.targetColumn.width);
                } 
                else {
                    if (that.s.mouse.neighbourColumn) {
                        var minColumnNeighbourWidth = Math.max(parseInt($(that.s.mouse.neighbourColumn.nTh).css('min-width')), 10);
                        var prevNeighbourWidth = $(that.s.mouse.neighbourColumn.nTh).width();
                        var newColWidth = Math.max(minColumnWidth, prevWidth + dx);
                        var newColNeighbourWidth = Math.max(minColumnNeighbourWidth, prevNeighbourWidth - dx);
                        var widthDiff = newColWidth - prevWidth;
                        var widthDiffNeighbour = newColNeighbourWidth - prevNeighbourWidth;
                        var colResizeIdx = parseInt(that.dom.resizeCol.attr("data-column-index"));
                        var neighbourColResizeIdx = parseInt(that.dom.resizeColNeighbour.attr("data-column-index"));
                        that.s.mouse.neighbourColumn.sWidthOrig = that.s.mouse.neighbourColumn.sWidth = that.s.mouse.neighbourColumn.width = newColNeighbourWidth + "px";
                        that.s.mouse.targetColumn.sWidthOrig = that.s.mouse.targetColumn.sWidth = that.s.mouse.targetColumn.width = newColWidth + "px";
                        var domNeighbourCols = $(that.s.dt.nTableWrapper).find("th[data-column-index='" + neighbourColResizeIdx + "']");
                        var domCols = $(that.s.dt.nTableWrapper).find("th[data-column-index='" + colResizeIdx + "']");
                        if (dx > 0) {
                            domNeighbourCols.width(that.s.mouse.neighbourColumn.width);
                            domCols.width(that.s.mouse.targetColumn.width);
                        } else {
                            domCols.width(that.s.mouse.targetColumn.width);
                            domNeighbourCols.width(that.s.mouse.neighbourColumn.width);
                        }
                    }
                }
            }
            that.s.mouse.startX = ePageX;
        },
        
        _fnClick: function (e) {
            var that = this;
            that.s.isMousedown = false;
            e.stopImmediatePropagation();
        },

        _fnMouseUp: function (e) {
            var that = this;
            that.s.isMousedown = false;

            that.s.mouse.targetColumn.width = that.dom.resizeCol.width();
//            this.dt.columns.adjust();
            
            var LeftWrapper = $(that.s.dt.nTableWrapper).find(".DTFC_LeftWrapper");
            var DTFC_LeftWidth = LeftWrapper.width();
            LeftWrapper.children(".DTFC_LeftHeadWrapper").children("table").width(DTFC_LeftWidth);

            $(that.dom.resizeCol).removeClass("dt-col-resize");
            $(this.dt.column(this.dom.resizeCol).nodes()).removeClass("dt-col-resize");
            that._fnSaveState();
            if (that.c.resizeCallback) {
                that.c.resizeCallback.call(that, that.s.mouse.targetColumn);
            }
        },

        _fnDestroy: function () {
            var i, iLen;

            for (i = 0, iLen = this.s.dt.aoDrawCallback.length; i < iLen; i++) {
                if (this.s.dt.aoDrawCallback[i].sName === 'ColResize_Pre') {
                    this.s.dt.aoDrawCallback.splice(i, 1);
                    break;
                }
            }

            $(this.s.dt.nTHead).find('*').off('.ColResize');

            $.each(this.s.dt.aoColumns, function (i, column) {
                $(column.nTh).removeAttr('data-column-index');
            });

            this.s.dt._colResize = null;
            this.s = null;
        },


    });


    ColResize.version = "1.0.1";
    ColResize.defaults = {
       "resizeCallback": null,
       "exclude": [],
       "tableWidthFixed": false,
       "handleWidth": 10,
       "rtl": false
   };

    /* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
     * DataTables interfaces
     */

    $.fn.dataTable.ColResize = ColResize;
    $.fn.DataTable.ColResize = ColResize;
    
    $.fn.dataTableExt.oApi.fnColResize = function (oSettings, iCol) {
        $(oSettings.oInstance).trigger('column-resize', [oSettings, {
            "iCol": iCol
        }]);
    };
    $.fn.dataTableExt.aoFeatures.push({
        "fnInit": function (settings) {
            if (!settings._colResize) {
                var dtInit = settings.oInit;
                var opts = dtInit.colResize || dtInit.oColResize || {};
                new ColResize(settings, opts);
            }
        },
        "cFeature": "Z",
        "sFeature": "ColResize"
    });
    DataTable.Api.register('colResize()', function() {});
    DataTable.Api.register('colResize.reset()', function() {
        return this.iterator('table', function(ctx) {
            var fh = ctx._colResize;
            if(fh){
                fh.reset();
            }
        });
    });
    return ColResize;
}));